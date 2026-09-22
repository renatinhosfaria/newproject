import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type {
  AgentEvent,
  BrokerContext,
  PersistedAgentEvent,
  SessionUser,
} from "@pacaembu/contracts";
import { requireBroker } from "../auth/policies.js";
import type { Clock } from "../clock.js";
import { CLOCK } from "../http/health.controller.js";
import { problem } from "../http/problem.filter.js";
import type { Tx } from "../db/client.js";
import { AgentsService } from "./agents.service.js";
import { toPublicEvent } from "./run-events.js";

export interface StreamRun {
  runId: string;
  terminal: boolean;
  lastSequence: number;
}
@Injectable()
export class EventStore {
  constructor(
    @Inject(AgentsService) private readonly agents: AgentsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}
  async authorizeStream(
    user: SessionUser,
    sessionId: string,
    runId: string,
  ): Promise<void> {
    const ctx = requireBroker(user, "sse");
    await this.agents.scoped(ctx, async (tx) => {
      await this.authorize(tx, ctx, sessionId, runId);
    });
  }
  private async authorize(
    tx: Tx,
    ctx: BrokerContext,
    sessionId: string,
    runId?: string,
  ): Promise<void> {
    const session = await this.agents.sessionRow(tx, sessionId);
    if (
      runId &&
      !(
        await tx.execute(
          sql`SELECT 1 FROM agent_runs WHERE run_id=${runId} AND session_id=${sessionId}`,
        )
      ).rows[0]
    )
      throw problem(404, "RESOURCE_NOT_FOUND");
    await this.agents.authorize(tx, ctx, session.agent_id);
    if (session.status !== "active")
      throw problem(403, "AGENT_SESSION_INACTIVE");
  }
  async prepare(
    ctx: BrokerContext,
    sessionId: string,
    runId?: string,
    cursor?: { runId: string; sequence: number },
  ): Promise<StreamRun> {
    return this.agents.scoped(ctx, async (tx) => {
      // Scope checks always precede cursor metadata and retention checks.
      await this.authorize(tx, ctx, sessionId, runId);
      if (!runId) {
        const active = await tx.execute(
          sql`SELECT run_id FROM agent_runs WHERE session_id=${sessionId} AND status IN ('queued','running') LIMIT 2`,
        );
        if (active.rows.length !== 1) throw problem(422, "RUN_ID_REQUIRED");
        runId = String(active.rows[0].run_id);
      }
      if (cursor && cursor.runId !== runId) {
        const visible = await tx.execute(
          sql`SELECT 1 FROM agent_runs WHERE run_id=${cursor.runId}`,
        );
        if (!visible.rows[0]) throw problem(404, "RESOURCE_NOT_FOUND");
        throw problem(422, "INVALID_EVENT_CURSOR");
      }
      const state = await this.state(tx, runId);
      if (cursor && cursor.sequence > state.lastSequence)
        throw problem(422, "INVALID_EVENT_CURSOR");
      return state;
    });
  }
  private async state(tx: Tx, runId: string): Promise<StreamRun> {
    const row = (
      await tx.execute(
        sql`SELECT status,events_expire_at,(SELECT coalesce(max(sequence),0) FROM agent_events WHERE run_id=${runId}) AS last_sequence FROM agent_runs WHERE run_id=${runId}`,
      )
    ).rows[0];
    if (!row) throw problem(404, "RESOURCE_NOT_FOUND");
    const terminal = ["completed", "failed", "cancelled"].includes(
      String(row.status),
    );
    if (
      terminal &&
      row.events_expire_at &&
      new Date(String(row.events_expire_at)).getTime() <=
        this.clock.now().getTime()
    )
      throw problem(410, "EVENT_REPLAY_UNAVAILABLE");
    return { runId, terminal, lastSequence: Number(row.last_sequence) };
  }
  async after(
    ctx: BrokerContext,
    sessionId: string,
    runId: string,
    sequence: number,
  ): Promise<AgentEvent[]> {
    return this.agents.scoped(ctx, async (tx) => {
      await this.authorize(tx, ctx, sessionId, runId);
      await this.state(tx, runId);
      const rows = await tx.execute(
        sql`SELECT id,workspace_id,broker_id,session_id,run_id,sequence,type,payload,request_id,occurred_at FROM agent_events WHERE session_id=${sessionId} AND run_id=${runId} AND sequence>${sequence} ORDER BY sequence LIMIT 100`,
      );
      return (rows.rows as unknown as PersistedAgentEvent[]).map(toPublicEvent);
    });
  }
}
