import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type TestHarness } from "../helpers/harness.js";
import { schema } from "../../apps/api/src/db/schema.js";

describe("isolamento do schema CRM", () => {
  let harnesses: TestHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("o próprio banco rejeita conversa ligada ao lead de outro broker", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const a = h.fixtures.brokerA;
    const b = h.fixtures.brokerB;
    const lead = await h.db
      .insert(schema.leads)
      .values({
        workspaceId: b.workspaceId,
        brokerId: b.brokerId!,
        name: "Lead B",
        stage: "novo",
      })
      .returning();

    await expect(
      h.pool.query(
        "INSERT INTO conversations (workspace_id, broker_id, lead_id) VALUES ($1,$2,$3)",
        [a.workspaceId, a.brokerId, lead[0].id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("rejeita membership, lead e inserção sem contexto de outro workspace", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const a = h.fixtures.brokerA;
    const c = h.fixtures.brokerC;

    await expect(
      h.pool.query(
        "INSERT INTO auth_sessions (user_id, workspace_id, membership_id, token_hash, expires_at, last_seen_at) VALUES ($1,$2,$3,$4,now()+interval '1 hour',now())",
        [a.userId, c.workspaceId, a.membershipId, "cross-workspace-token"],
      ),
    ).rejects.toMatchObject({ code: "23503" });

    await h.pool.query("select set_config('app.workspace_id', $1, true)", [
      a.workspaceId,
    ]);
    await h.pool.query("select set_config('app.broker_id', $1, true)", [
      a.brokerId,
    ]);
    await expect(
      h.pool.query("SELECT id FROM leads WHERE workspace_id = $1", [
        c.workspaceId,
      ]),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      h.pool.query(
        "INSERT INTO leads (workspace_id, broker_id, name, stage) VALUES ($1,$2,$3,$4)",
        [c.workspaceId, c.brokerId, "Cross wallet", "novo"],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("mantém auditoria append-only para a role da API", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const a = h.fixtures.brokerA;
    const audit = await h.pool.query(
      "INSERT INTO audit_events (workspace_id, actor_user_id, broker_id, event_type, resource_type, request_id, metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [
        a.workspaceId,
        a.userId,
        a.brokerId,
        "test.event",
        "lead",
        "req-test",
        {},
      ],
    );
    await expect(
      h.pool.query("UPDATE audit_events SET event_type = $1 WHERE id = $2", [
        "tampered",
        audit.rows[0].id,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("aplica migrations e seed sem duplicar dados operacionais", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const before = await h.pool.query(
      "SELECT count(*)::int AS count FROM users",
    );
    await h.seedAgain();
    const after = await h.pool.query(
      "SELECT count(*)::int AS count FROM users",
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    const tables = await h.pool.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> 'schema_migrations'",
    );
    expect(tables.rows[0].count).toBe(16);
    const forbidden = await h.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('outbox_messages','hermes_profiles','whatsapp_connections')",
    );
    expect(forbidden.rows).toEqual([]);
  });
});
