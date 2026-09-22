import { afterEach, describe, expect, it } from "vitest";
import { loginAs } from "../helpers/auth.js";
import { createHarness, type TestHarness } from "../helpers/harness.js";

describe("isolamento do schema CRM", () => {
  let harnesses: TestHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((harness) => harness.close()));
  });

  it("isola harnesses simultâneos e remove apenas seu próprio schema", async () => {
    const [a, b] = await Promise.all([createHarness(), createHarness()]);
    harnesses.push(a, b);
    const schemaA = (await a.pool.query("SELECT current_schema() AS name"))
      .rows[0].name;
    const schemaB = (await b.pool.query("SELECT current_schema() AS name"))
      .rows[0].name;
    expect(schemaA).not.toBe("public");
    expect(schemaA).not.toBe(schemaB);
    await a.ownerPool.query("UPDATE users SET status='suspended' WHERE id=$1", [
      a.fixtures.brokerA.userId,
    ]);
    expect(
      (
        await b.pool.query("SELECT status FROM users WHERE id=$1", [
          b.fixtures.brokerA.userId,
        ])
      ).rows[0].status,
    ).toBe("active");
    await a.close();
    harnesses.splice(harnesses.indexOf(a), 1);
    expect(
      (
        await b.ownerPool.query("SELECT 1 FROM pg_namespace WHERE nspname=$1", [
          schemaA,
        ])
      ).rowCount,
    ).toBe(0);
    expect((await b.pool.query("SELECT count(*) FROM users")).rowCount).toBe(1);
  });

  it("executa sob role restrita e impede shadowing do lookup por tabela temporária", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const role = (
      await h.pool.query(
        "SELECT current_user AS name, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    expect(role).toEqual({
      name: "pacaembu_app",
      rolsuper: false,
      rolbypassrls: false,
    });
    await expect(
      h.pool.query("CREATE TABLE app_owned (id int)"),
    ).rejects.toMatchObject({ code: "42501" });
    const broker = h.fixtures.brokerB;
    await h.pool.query(
      "CREATE TEMP TABLE brokers (id uuid, user_id uuid, workspace_id uuid, status text)",
    );
    await h.pool.query(
      "INSERT INTO pg_temp.brokers VALUES ($1,$2,$3,'suspended')",
      [broker.brokerId, broker.userId, broker.workspaceId],
    );
    const lookup = await h.pool.query(
      "SELECT * FROM auth_broker_for_user($1,$2)",
      [broker.userId, broker.workspaceId],
    );
    expect(lookup.rows).toEqual([{ id: broker.brokerId, status: "active" }]);
    const publicGrant = await h.ownerPool
      .query(`SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) acl
      WHERE p.oid = 'auth_broker_for_user(uuid,uuid)'::regprocedure AND acl.grantee=0 AND acl.privilege_type='EXECUTE'`);
    expect(publicGrant.rows).toEqual([]);
    const guards = await h.ownerPool
      .query(`SELECT proconfig FROM pg_proc WHERE pronamespace=current_schema()::regnamespace
      AND proname IN ('auth_broker_for_user','assert_agent_session_scope','assert_agent_session_agent_available','assert_agent_available')`);
    expect(guards.rowCount).toBe(4);
    for (const guard of guards.rows)
      expect(guard.proconfig[0]).toMatch(
        /^search_path=test_[a-f0-9]+, pg_temp$/,
      );
  });

  it("o próprio banco rejeita conversa ligada ao lead de outro broker", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const a = h.fixtures.brokerA;
    const b = h.fixtures.brokerB;
    const lead = await h.ownerPool.query(
      "INSERT INTO leads (workspace_id, broker_id, name, stage) VALUES ($1,$2,'Lead B','novo') RETURNING id",
      [b.workspaceId, b.brokerId],
    );

    await expect(
      h.pool.query(
        "INSERT INTO conversations (workspace_id, broker_id, lead_id) VALUES ($1,$2,$3)",
        [a.workspaceId, a.brokerId, lead.rows[0].id],
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
    // Reproduce an installation that already applied 0001–0007 with the old
    // function path and without auth-session UPDATE privileges.
    await h.ownerPool.query(
      "DELETE FROM schema_migrations WHERE version='0008'",
    );
    await h.ownerPool.query(
      "ALTER FUNCTION auth_broker_for_user(uuid,uuid) SET search_path=public,pg_temp",
    );
    await h.ownerPool.query("REVOKE UPDATE ON auth_sessions FROM pacaembu_app");
    await h.seedAgain();
    const cookie = await loginAs(h, h.fixtures.brokerA);
    expect(
      (await h.http.get("/api/auth/me").set("Cookie", cookie)).status,
    ).toBe(200);
    const after = await h.pool.query(
      "SELECT count(*)::int AS count FROM users",
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
    const tables = await h.pool.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = current_schema() AND table_name <> 'schema_migrations'",
    );
    expect(tables.rows[0].count).toBe(16);
    const forbidden = await h.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ('outbox_messages','hermes_profiles','whatsapp_connections')",
    );
    expect(forbidden.rows).toEqual([]);
  });
});
