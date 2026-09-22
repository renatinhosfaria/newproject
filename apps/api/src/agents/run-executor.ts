import {
  Inject,
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import type pg from "pg";
import { sql } from "drizzle-orm";
import {
  AgentResultSchema,
  type AgentResult,
  type BrokerContext,
} from "@pacaembu/contracts";
import { DB } from "../auth/auth.service.js";
import { POOL } from "../auth/auth.module.js";
import type { Db, Tx } from "../db/client.js";
import type { Clock } from "../clock.js";
import { CLOCK } from "../http/health.controller.js";
import { ProblemError, problem } from "../http/problem.filter.js";
import { AgentsService } from "./agents.service.js";
import {
  EXECUTOR_ENABLED,
  HERMES,
  type Capability,
  type HermesPort,
  type RunContext,
} from "./hermes.port.js";
import { appendRunEvent } from "./run-events.js";

type Pending = BrokerContext & { run_id: string; status: "queued" | "running" };
@Injectable()
export class RunExecutor implements OnModuleInit, OnModuleDestroy {
  private lock?: pg.PoolClient;
  private timer?: ReturnType<typeof setTimeout>;
  private task?: Promise<void>;
  private stopping = false;
  private active?: RunContext;
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(POOL) private readonly pool: pg.Pool,
    @Inject(AgentsService) private readonly agents: AgentsService,
    @Inject(HERMES) private readonly hermes: HermesPort,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(EXECUTOR_ENABLED) private readonly enabled: boolean,
  ) {}
  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    this.lock = await this.pool.connect();
    // One owner per database schema; the lock is held by a dedicated connection.
    const acquired = await this.lock.query(
      "SELECT pg_try_advisory_lock(hashtextextended(current_schema() || ':agent-executor',0)) AS acquired",
    );
    if (!acquired.rows[0].acquired) {
      this.lock.release();
      this.lock = undefined;
      throw new Error("Agent executor already active");
    }
    const pending = await this.pending();
    for (const row of pending.filter((r) => r.status === "running"))
      await this.fail(row, "RUN_INTERRUPTED", "failed");
    this.schedule();
  }
  private schedule(): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.task = this.drain()
        .catch(() => {
          /* Queued/running rows remain durable for the next drain. No raw errors in logs. */
        })
        .finally(() => {
          this.task = undefined;
          this.schedule();
        });
    }, 25);
    this.timer.unref();
  }
  private async pending(): Promise<Pending[]> {
    const rows = await this.db.execute(
      sql`SELECT * FROM pending_agent_run_scopes()`,
    );
    return rows.rows.map((row) => ({
      ...row,
      role: "broker",
    })) as unknown as Pending[];
  }
  private async drain(): Promise<void> {
    for (const row of await this.pending()) {
      if (this.stopping) return;
      // Only this executor owns the advisory lock. A leftover running row means
      // a prior persistence attempt failed, never an invitation to rerun a tool.
      if (row.status === "running")
        await this.fail(row, "RUN_INTERRUPTED", "failed");
      else await this.execute(row);
    }
  }
  private async execute(scope: Pending): Promise<void> {
    let ctx: RunContext | undefined;
    try {
      const claimed = await this.agents.scoped(scope, async (tx) => {
        const row = (
          await tx.execute(
            sql`SELECT status,input_content FROM agent_runs WHERE run_id=${scope.run_id} FOR UPDATE`,
          )
        ).rows[0];
        if (!row || row.status !== "queued") return;
        const context = await this.agents.context(tx, scope, scope.run_id);
        await tx.execute(
          sql`UPDATE agent_runs SET status='running',updated_at=${this.clock.now()} WHERE run_id=${scope.run_id}`,
        );
        return { context, input: { content: String(row.input_content) } };
      });
      if (!claimed) return;
      ctx = claimed.context;
      this.active = ctx;
      if (this.stopping) {
        await this.fail(scope, "RUN_CANCELLED", "cancelled");
        return;
      }
      await this.hermes.startAgentRun(ctx, claimed.input);
      let result: AgentResult | undefined;
      const used = new Set<Capability>();
      let completed = false;
      for await (const event of this.hermes.streamAgentEvents(ctx.run_id, 0)) {
        if (this.stopping) break;
        if (event.type === "agent.output.created") {
          result = AgentResultSchema.parse(event.result);
          if (
            result.type !== "draft" ||
            result.status !== "completed" ||
            !result.content.trim() ||
            result.content.length > 12000
          )
            throw problem(422, "INVALID_AGENT_OUTPUT");
          continue; // No partial draft becomes visible before the terminal commit.
        }
        if (event.type === "agent.run.failed") throw problem(503, event.code);
        if (event.type === "agent.run.completed") {
          if (!result) throw problem(502, "INCOMPLETE_AGENT_OUTPUT");
          await this.complete(ctx, result, used);
          completed = true;
          break;
        }
        if (event.type === "agent.tool.called") used.add(event.tool);
        await this.agents.scoped(ctx, async (tx) => {
          await appendRunEvent(
            tx,
            ctx!,
            event.type,
            event.type === "agent.tool.called" ? { tool: event.tool } : {},
            this.clock.now(),
          );
          if (event.type === "agent.run.started")
            await this.agents.auditEvent(tx, ctx!, event.type, ctx!.run_id);
        });
      }
      if (!completed)
        await this.fail(
          scope,
          this.stopping ? "RUN_CANCELLED" : "INCOMPLETE_AGENT_OUTPUT",
          this.stopping ? "cancelled" : "failed",
        );
    } catch (error) {
      await this.fail(
        scope,
        this.stopping
          ? "RUN_CANCELLED"
          : error instanceof ProblemError
            ? error.code
            : "AGENT_EXECUTION_FAILED",
        this.stopping ? "cancelled" : "failed",
      );
    } finally {
      if (ctx) await this.hermes.stopAgentRun(ctx.run_id);
      this.active = undefined;
    }
  }
  private async complete(
    ctx: RunContext,
    result: AgentResult,
    used: Set<Capability>,
  ): Promise<void> {
    const denied = await this.agents.scoped(ctx, async (tx) => {
      const row = (
        await tx.execute(
          sql`SELECT status FROM agent_runs WHERE run_id=${ctx.run_id} FOR UPDATE`,
        )
      ).rows[0];
      if (row?.status !== "running" || this.stopping)
        throw problem(409, "RUN_CANCELLED");
      const fresh = await this.agents.context(tx, ctx, ctx.run_id);
      for (const capability of new Set([...used, "crm.message.draft" as const]))
        if (!fresh.permissions.includes(capability)) {
          await this.agents.auditEvent(
            tx,
            ctx,
            "agent.tool.denied",
            ctx.run_id,
            "agent_run",
            { tool: capability, code: "AGENT_CAPABILITY_DENIED" },
          );
          return capability;
        }
      const canonical = { ...result, request_id: ctx.request_id };
      let messageId: string | null = null;
      if (fresh.conversation_id) {
        const message = (
          await tx.execute(sql`INSERT INTO messages(workspace_id,broker_id,conversation_id,direction,author,status,content,metadata_json,occurred_at)
          VALUES(${ctx.workspace_id},${ctx.broker_id},${fresh.conversation_id},'outbound','agent','draft',${canonical.content},${JSON.stringify({ run_id: ctx.run_id, simulated: true })}::jsonb,${this.clock.now()}) RETURNING id`)
        ).rows[0];
        messageId = String(message.id);
      }
      await tx.execute(
        sql`UPDATE agent_runs SET status='completed',result_json=${JSON.stringify(canonical)}::jsonb,output_message_id=${messageId},updated_at=${this.clock.now()},events_expire_at=${this.expiry()} WHERE run_id=${ctx.run_id}`,
      );
      await appendRunEvent(
        tx,
        ctx,
        "agent.output.created",
        { result: canonical },
        this.clock.now(),
      );
      await appendRunEvent(
        tx,
        ctx,
        "agent.run.completed",
        {},
        this.clock.now(),
      );
      await this.agents.auditEvent(tx, ctx, "agent.output.created", ctx.run_id);
      await this.agents.auditEvent(tx, ctx, "agent.run.completed", ctx.run_id);
    });
    if (denied) throw problem(403, "AGENT_CAPABILITY_DENIED");
  }
  private expiry(): Date {
    return new Date(this.clock.now().getTime() + 7 * 86400000);
  }
  private async fail(
    scope: Pending,
    code: string,
    status: "failed" | "cancelled",
  ): Promise<void> {
    await this.agents.scoped(scope, async (tx: Tx) => {
      const row = (
        await tx.execute(
          sql`SELECT status,session_id FROM agent_runs WHERE run_id=${scope.run_id} FOR UPDATE`,
        )
      ).rows[0];
      if (!row || !["queued", "running"].includes(String(row.status))) return;
      const ctx = {
        ...scope,
        agent_id: "",
        agent_session_id: String(row.session_id),
        permissions: [],
      } satisfies RunContext;
      const result: AgentResult = {
        type: "error",
        content: "Não foi possível concluir o atendimento simulado.",
        citations: [],
        proposed_actions: [],
        requires_approval: false,
        status,
        request_id: scope.request_id,
      };
      await tx.execute(
        sql`UPDATE agent_runs SET status=${status},error_code=${code},result_json=${JSON.stringify(result)}::jsonb,updated_at=${this.clock.now()},events_expire_at=${this.expiry()} WHERE run_id=${scope.run_id}`,
      );
      await appendRunEvent(
        tx,
        ctx,
        "agent.run.failed",
        { code, status },
        this.clock.now(),
      );
      await this.agents.auditEvent(
        tx,
        scope,
        status === "cancelled" ? "agent.run.cancelled" : "agent.run.failed",
        scope.run_id,
        "agent_run",
        { code },
      );
    });
  }
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.active) await this.hermes.stopAgentRun(this.active.run_id);
    await this.task;
    if (this.lock) {
      await this.lock.query(
        "SELECT pg_advisory_unlock(hashtextextended(current_schema() || ':agent-executor',0))",
      );
      this.lock.release();
      this.lock = undefined;
    }
  }
}
