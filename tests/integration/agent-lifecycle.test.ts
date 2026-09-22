import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import type pg from "pg";
import { createApp } from "../../apps/api/src/app.js";
import { POOL } from "../../apps/api/src/auth/auth.module.js";
import { createDb, createPool } from "../../apps/api/src/db/client.js";
import { RunExecutor } from "../../apps/api/src/agents/run-executor.js";
import { AgentsService } from "../../apps/api/src/agents/agents.service.js";
import {
  HERMES,
  type HermesPort,
} from "../../apps/api/src/agents/hermes.port.js";
import { createHarness, type TestHarness } from "../helpers/harness.js";
import { loginAs } from "../helpers/auth.js";
import { post, waitForRun } from "../helpers/runs.js";

const acquire =
  "SELECT pg_try_advisory_lock(hashtextextended(current_schema() || ':agent-executor',0)) AS acquired";
const release =
  "SELECT pg_advisory_unlock(hashtextextended(current_schema() || ':agent-executor',0))";
async function within<T>(operation: Promise<T>): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), 400);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe("agent executor initialization lifecycle", () => {
  let h: TestHarness;
  beforeEach(async () => {
    h = await createHarness({ executorPaused: true });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await h.close();
  });

  it("DB_POOL_MAX=1 rejeita antes de reservar cliente ou enfileirar discovery", async () => {
    vi.stubEnv("DB_POOL_MAX", "1");
    const pool = createPool(h.pool.options.connectionString);
    const executor = new RunExecutor(
      createDb(pool),
      pool,
      h.app.get(AgentsService),
      h.app.get<HermesPort>(HERMES),
      h.clock,
      true,
    );
    const initialization = executor.onModuleInit().then(
      () => "initialized",
      (error: Error) => error.message,
    );
    try {
      expect(await within(initialization)).toBe(
        "Agent executor requires DB_POOL_MAX >= 2",
      );
      expect(pool.totalCount).toBe(0);
      expect(pool.waitingCount).toBe(0);
    } finally {
      // Also release the pre-fix deadlock so RED leaves no test resources behind.
      await executor.onModuleDestroy();
      await initialization;
      await pool.end();
    }
  });

  it("falha de discovery libera o lock/cliente mesmo sem fechamento pelo chamador", async () => {
    const pool = createPool(h.pool.options.connectionString);
    const executor = new RunExecutor(
      createDb(pool),
      pool,
      h.app.get(AgentsService),
      h.app.get<HermesPort>(HERMES),
      h.clock,
      true,
    );
    await h.ownerPool.query(
      "REVOKE EXECUTE ON FUNCTION pending_agent_run_scopes() FROM pacaembu_app",
    );
    try {
      await expect(executor.onModuleInit()).rejects.toThrow();
      const observer = await h.pool.query(acquire);
      expect(observer.rows[0].acquired).toBe(true);
      await h.pool.query(release);
      expect(pool.totalCount).toBe(pool.idleCount);
      expect(await within(pool.end())).not.toBe("timeout");
    } finally {
      await h.pool.query(release);
      await executor.onModuleDestroy();
      if (!pool.ending) await pool.end();
    }
  });

  it.each(["discovery", "recovery"])(
    "createApp fecha o pool após falha de %s e permite reinício",
    async (fault) => {
      let runId: string | undefined;
      if (fault === "recovery") {
        const cookie = await loginAs(h, h.fixtures.brokerA);
        const session = await post(h, cookie, "/api/agent-sessions", {
          agent_id: "atendimento",
        });
        const accepted = await post(
          h,
          cookie,
          `/api/agent-sessions/${session.body.id}/messages`,
          { content: "input preservado" },
        );
        runId = accepted.body.run_id;
        await h.ownerPool.query(
          "UPDATE agent_runs SET status='running' WHERE run_id=$1",
          [runId],
        );
        await h.ownerPool.query(
          "CREATE FUNCTION fail_recovery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic recovery failure'; END $$; CREATE TRIGGER fail_recovery BEFORE UPDATE ON agent_runs FOR EACH ROW EXECUTE FUNCTION fail_recovery()",
        );
      } else
        await h.ownerPool.query(
          "REVOKE EXECUTE ON FUNCTION pending_agent_run_scopes() FROM pacaembu_app",
        );

      // Instrument creation only to retain a cleanup handle for a failing regression.
      // Every app, pool, query and lifecycle hook still runs its real implementation.
      const create = NestFactory.create.bind(NestFactory);
      let failedApp: INestApplication | undefined;
      let failedPool: pg.Pool | undefined;
      vi.spyOn(NestFactory, "create").mockImplementationOnce(
        async (...args) => {
          const app = await create(...args);
          failedApp = app;
          failedPool = app.get<pg.Pool>(POOL);
          return app;
        },
      );
      try {
        await expect(
          createApp(
            { nodeEnv: "test", databaseUrl: h.pool.options.connectionString },
            { clock: h.clock },
          ),
        ).rejects.toThrow();
        expect(failedPool?.ended).toBe(true);
        const observer = await h.pool.query(acquire);
        expect(observer.rows[0].acquired).toBe(true);
        await h.pool.query(release);
        if (fault === "recovery")
          await h.ownerPool.query("DROP TRIGGER fail_recovery ON agent_runs");
        else
          await h.ownerPool.query(
            "GRANT EXECUTE ON FUNCTION pending_agent_run_scopes() TO pacaembu_app",
          );
        const healthy = await createApp(
          { nodeEnv: "test", databaseUrl: h.pool.options.connectionString },
          { clock: h.clock },
        );
        try {
          if (runId)
            expect((await waitForRun(h, runId, "failed")).error_code).toBe(
              "RUN_INTERRUPTED",
            );
          expect(
            (await healthy.inject({ method: "GET", url: "/health" }))
              .statusCode,
          ).toBe(200);
        } finally {
          await healthy.close();
        }
      } finally {
        await h.pool.query(release);
        if (failedApp && !failedPool?.ended) await failedApp.close();
      }
    },
  );
});
