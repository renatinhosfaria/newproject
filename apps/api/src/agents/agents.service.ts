import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type {
  AgentSession,
  AgentRun,
  BrokerContext,
  CreateAgentSessionRequest,
  AgentMessageRequest,
  SessionUser,
} from "@pacaembu/contracts";
import { DB } from "../auth/auth.service.js";
import type { Clock } from "../clock.js";
import { CLOCK } from "../http/health.controller.js";
import { AuditService } from "../audit/audit.service.js";
import { type Db, type Tx, withWorkspaceContext } from "../db/client.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import { problem } from "../http/problem.filter.js";
import {
  CAPABILITIES,
  type Capability,
  type RunContext,
} from "./hermes.port.js";
import { iso, toRun, type RunRow } from "./run-events.js";

export interface Agent {
  id: string;
  name: string;
  description: string;
  status: "online";
  capabilities: Capability[];
}
interface SessionRow {
  id: string;
  agent_id: string;
  agent_key: string;
  lead_id: string | null;
  conversation_id: string | null;
  title: string;
  status: AgentSession["status"];
  created_at: Date;
  updated_at: Date;
}
@Injectable()
export class AgentsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  scoped<T>(ctx: BrokerContext, operation: (tx: Tx) => Promise<T>): Promise<T> {
    return withWorkspaceContext(
      this.db,
      { workspaceId: ctx.workspace_id, brokerId: ctx.broker_id },
      operation,
    );
  }
  async catalog(user: SessionUser): Promise<Agent[]> {
    return withWorkspaceContext(
      this.db,
      { workspaceId: user.workspace_id },
      async (tx) => {
        const rows = await tx.execute(
          sql`SELECT a.id,a.key,a.name,a.description FROM agents a JOIN workspace_agents w ON w.agent_id=a.id WHERE w.workspace_id=${user.workspace_id} AND w.enabled AND a.status='active' AND a.key='atendimento'`,
        );
        return Promise.all(
          rows.rows.map(async (row) => ({
            id: String(row.key),
            name: String(row.name),
            description: String(row.description),
            status: "online" as const,
            capabilities: await this.permissions(tx, String(row.id)),
          })),
        );
      },
    );
  }
  async permissions(tx: Tx, agentId: string): Promise<Capability[]> {
    const rows = await tx.execute(
      sql`SELECT key FROM agent_capabilities WHERE agent_id=${agentId} ORDER BY key`,
    );
    return rows.rows
      .map((row) => String(row.key))
      .filter((key): key is Capability =>
        CAPABILITIES.includes(key as Capability),
      );
  }
  async authorize(
    tx: Tx,
    ctx: BrokerContext,
    agentId: string,
  ): Promise<Capability[]> {
    const rows =
      await tx.execute(sql`SELECT a.id FROM agents a JOIN workspace_agents wa ON wa.agent_id=a.id
      JOIN workspaces w ON w.id=wa.workspace_id
      JOIN workspace_memberships m ON m.workspace_id=w.id AND m.id=${ctx.membership_id} AND m.user_id=${ctx.user_id}
      JOIN users u ON u.id=m.user_id
      JOIN brokers b ON b.id=${ctx.broker_id} AND b.user_id=u.id AND b.workspace_id=w.id
      WHERE a.id=${agentId} AND a.key='atendimento' AND a.status='active' AND wa.workspace_id=${ctx.workspace_id} AND wa.enabled
        AND w.status='active' AND m.status='active' AND m.role='broker' AND u.status='active' AND b.status='active'`);
    if (!rows.rows[0]) throw problem(403, "AGENT_UNAVAILABLE");
    return this.permissions(tx, agentId);
  }
  async references(
    tx: Tx,
    input: { lead_id?: string | null; conversation_id?: string | null },
  ): Promise<{ lead_id: string | null; conversation_id: string | null }> {
    let leadId = input.lead_id ?? null;
    if (
      leadId &&
      !(await tx.execute(sql`SELECT id FROM leads WHERE id=${leadId}`)).rows[0]
    )
      throw problem(404, "RESOURCE_NOT_FOUND");
    if (input.conversation_id) {
      const row = (
        await tx.execute(
          sql`SELECT lead_id FROM conversations WHERE id=${input.conversation_id}`,
        )
      ).rows[0];
      if (!row) throw problem(404, "RESOURCE_NOT_FOUND");
      if (leadId && row.lead_id !== leadId)
        throw problem(422, "AGENT_CONTEXT_MISMATCH");
      leadId = String(row.lead_id);
    }
    return { lead_id: leadId, conversation_id: input.conversation_id ?? null };
  }
  async createSession(
    ctx: BrokerContext,
    input: CreateAgentSessionRequest,
    key: string,
  ): Promise<AgentSession> {
    const check = async (tx: Tx) => {
      const refs = await this.references(tx, input);
      const agent = (
        await tx.execute(sql`SELECT id FROM agents WHERE key=${input.agent_id}`)
      ).rows[0];
      if (!agent) throw problem(403, "AGENT_UNAVAILABLE");
      await this.authorize(tx, ctx, String(agent.id));
      return { ...refs, agentId: String(agent.id) };
    };
    await this.scoped(ctx, check);
    return (
      await this.idempotency.execute(
        ctx,
        "POST /api/agent-sessions",
        key,
        input,
        async (tx) => {
          const data = await check(tx);
          const row = (
            await tx.execute(sql`INSERT INTO agent_sessions(workspace_id,broker_id,user_id,agent_id,lead_id,conversation_id,title,status,created_at,updated_at)
        VALUES(${ctx.workspace_id},${ctx.broker_id},${ctx.user_id},${data.agentId},${data.lead_id},${data.conversation_id},${input.title ?? "Atendimento simulado"},'active',${this.clock.now()},${this.clock.now()}) RETURNING id`)
          ).rows[0];
          await this.auditEvent(
            tx,
            ctx,
            "agent.session.created",
            String(row.id),
            "agent_session",
          );
          return {
            status: 201,
            body: await this.sessionInTx(tx, ctx, String(row.id)),
          };
        },
      )
    ).body;
  }
  async session(ctx: BrokerContext, id: string): Promise<AgentSession> {
    return this.scoped(ctx, (tx) => this.sessionInTx(tx, ctx, id));
  }
  async sessionRow(tx: Tx, id: string): Promise<SessionRow> {
    const row = (
      await tx.execute(
        sql`SELECT s.*,a.key AS agent_key FROM agent_sessions s JOIN agents a ON a.id=s.agent_id WHERE s.id=${id}`,
      )
    ).rows[0] as unknown as SessionRow | undefined;
    if (!row) throw problem(404, "RESOURCE_NOT_FOUND");
    await this.references(tx, row);
    return row;
  }
  private async sessionInTx(
    tx: Tx,
    _ctx: BrokerContext,
    id: string,
  ): Promise<AgentSession> {
    const row = await this.sessionRow(tx, id);
    const runs = await tx.execute(
      sql`SELECT * FROM agent_runs WHERE session_id=${id} ORDER BY created_at,run_id`,
    );
    return {
      id: row.id,
      agent_id: row.agent_key,
      lead_id: row.lead_id,
      conversation_id: row.conversation_id,
      title: row.title,
      status: row.status,
      runs: (runs.rows as unknown as RunRow[]).map(toRun),
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    };
  }
  async send(
    ctx: BrokerContext,
    sessionId: string,
    input: AgentMessageRequest,
    key: string,
  ): Promise<AgentRun> {
    const check = async (tx: Tx) => {
      const session = await this.sessionRow(tx, sessionId);
      await this.authorize(tx, ctx, session.agent_id);
      if (session.status !== "active")
        throw problem(403, "AGENT_SESSION_INACTIVE");
    };
    await this.scoped(ctx, check);
    return (
      await this.idempotency.execute(
        ctx,
        `POST /api/agent-sessions/${sessionId}/messages`,
        key,
        input,
        async (tx) => {
          await check(tx);
          const row = (
            await tx.execute(sql`INSERT INTO agent_runs(workspace_id,broker_id,session_id,input_content,request_id,status,created_at,updated_at)
        VALUES(${ctx.workspace_id},${ctx.broker_id},${sessionId},${input.content},${ctx.request_id},'queued',${this.clock.now()},${this.clock.now()}) RETURNING *`)
          ).rows[0] as unknown as RunRow;
          await this.auditEvent(tx, ctx, "agent.run.queued", row.run_id);
          return { status: 202, body: toRun(row) };
        },
      )
    ).body;
  }
  async context(
    tx: Tx,
    scope: BrokerContext,
    runId: string,
  ): Promise<RunContext> {
    const run = (
      await tx.execute(
        sql`SELECT session_id FROM agent_runs WHERE run_id=${runId}`,
      )
    ).rows[0];
    if (!run) throw problem(404, "RESOURCE_NOT_FOUND");
    const session = await this.sessionRow(tx, String(run.session_id));
    const permissions = await this.authorize(tx, scope, session.agent_id);
    if (session.status !== "active")
      throw problem(403, "AGENT_SESSION_INACTIVE");
    return {
      ...scope,
      run_id: runId,
      agent_id: session.agent_id,
      agent_session_id: session.id,
      lead_id: session.lead_id ?? undefined,
      conversation_id: session.conversation_id ?? undefined,
      permissions,
    };
  }
  auditEvent(
    tx: Tx,
    ctx: BrokerContext,
    type: string,
    id: string,
    resourceType = "agent_run",
    metadata?: Record<string, string>,
  ): Promise<void> {
    return this.audit.append(tx, {
      workspaceId: ctx.workspace_id,
      brokerId: ctx.broker_id,
      actorUserId: ctx.user_id,
      eventType: type,
      resourceType,
      resourceId: id,
      requestId: ctx.request_id,
      metadata,
    });
  }
}
