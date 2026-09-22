import { createHash } from "node:crypto";
import { AuditService } from "../../apps/api/src/audit/audit.service.js";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type TestHarness } from "../helpers/harness.js";
import { loginAs } from "../helpers/auth.js";

describe("autenticação revogável", () => {
  const harnesses: TestHarness[] = [];
  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((h) => h.close()));
  });

  it("impede cache de respostas auth e limpa cookie inválido no logout", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const me = await h.http.get("/api/auth/me");
    expect(me.headers["cache-control"]).toBe("no-store");
    const logout = await h.http
      .post("/api/auth/logout")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", "crm_session=invalid");
    expect(logout.headers["set-cookie"]).toContain("Max-Age=0");
    expect(logout.headers["cache-control"]).toBe("no-store");
    expect(logout.status).toBe(401);
    const missing = await h.http
      .post("/api/auth/logout")
      .set("Origin", "http://localhost:3000");
    expect(String(missing.headers["set-cookie"])).toContain("Max-Age=0");
    const invalidBody = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({});
    expect(invalidBody.status).toBe(422);
    expect(invalidBody.headers["cache-control"]).toBe("no-store");
    const csrf = await h.http.post("/api/auth/login").send({});
    expect(csrf.status).toBe(403);
    expect(csrf.headers["cache-control"]).toBe("no-store");
  });

  it.each(["users", "workspaces", "brokers"])(
    "revoga cookie existente quando %s é suspenso",
    async (table) => {
      const h = await createHarness();
      harnesses.push(h);
      const actor = h.fixtures.brokerA;
      const cookie = await loginAs(h, actor);
      const id =
        table === "users"
          ? actor.userId
          : table === "workspaces"
            ? actor.workspaceId
            : actor.brokerId;
      await h.ownerPool.query(
        `UPDATE ${table} SET status='suspended' WHERE id=$1`,
        [id],
      );
      const response = await h.http.get("/api/auth/me").set("Cookie", cookie);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe("SESSION_INVALID");
      expect(response.body).not.toHaveProperty("broker_id");
    },
  );

  it("rejeita usuário ativo sem memberships", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const actor = h.fixtures.supervisor;
    await h.ownerPool.query(
      "DELETE FROM workspace_memberships WHERE user_id=$1",
      [actor.userId],
    );
    const response = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email: actor.email, password: actor.password });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("NO_ACTIVE_MEMBERSHIP");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("autentica B/C com Argon2 real e persiste somente SHA-256 de tokens distintos", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const tokens: string[] = [];
    for (const actor of [
      h.fixtures.brokerA,
      h.fixtures.brokerB,
      h.fixtures.brokerC,
    ]) {
      const cookie = await loginAs(h, actor);
      const token = cookie.split("=")[1];
      tokens.push(token);
      const me = await h.http.get("/api/auth/me").set("Cookie", cookie);
      expect(me.status).toBe(200);
      expect(me.headers["cache-control"]).toBe("no-store");
      expect(me.body).toMatchObject({
        id: actor.userId,
        broker_id: actor.brokerId,
        workspace_id: actor.workspaceId,
      });
      const session = (
        await h.ownerPool.query(
          "SELECT * FROM auth_sessions WHERE user_id=$1",
          [actor.userId],
        )
      ).rows[0];
      expect(session.token_hash).toBe(
        createHash("sha256").update(token).digest("hex"),
      );
      expect(session.id).not.toBe(token);
      expect(JSON.stringify(session)).not.toContain(token);
    }
    expect(new Set(tokens).size).toBe(3);
  });

  it("audita sucesso, logout e falha com metadata segura e contador", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const actor = h.fixtures.brokerA;
    const password = "failed-password-secret";
    await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email: actor.email, password });
    const cookie = await loginAs(h, actor);
    await h.http
      .post("/api/auth/logout")
      .set("Origin", "http://localhost:3000")
      .set("Cookie", cookie);
    const events = (
      await h.ownerPool.query("SELECT * FROM audit_events ORDER BY created_at")
    ).rows;
    expect(events.map((event) => event.event_type)).toEqual([
      "auth.login.failed",
      "auth.login.succeeded",
      "auth.logout",
    ]);
    expect(events[0].metadata_json).toEqual({
      code: "INVALID_CREDENTIALS",
      count: 1,
    });
    expect(events[1].metadata_json).toEqual({ method: "password" });
    expect(events[2].metadata_json).toEqual({});
    expect(
      events.every(
        (event) =>
          event.actor_user_id === actor.userId &&
          event.workspace_id === actor.workspaceId,
      ),
    ).toBe(true);
    const serialized = JSON.stringify(events);
    for (const secret of [
      password,
      actor.password,
      cookie,
      cookie.split("=")[1],
      h.fixtures.brokerB.email,
    ])
      expect(serialized).not.toContain(secret);
  });

  it("descarta metadata de auditoria fora da allowlist", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const actor = h.fixtures.brokerA;
    await h.db.transaction((tx) =>
      new AuditService().append(tx, {
        workspaceId: actor.workspaceId,
        actorUserId: actor.userId,
        brokerId: actor.brokerId,
        eventType: "auth.login.failed",
        resourceType: "auth_session",
        requestId: "safe-audit-test",
        metadata: {
          code: "INVALID_CREDENTIALS",
          count: 1,
          password: "password-secret",
          cookie: "cookie-secret",
          token: "token-secret",
          email: "other@example.test",
        },
      }),
    );
    const event = (
      await h.ownerPool.query(
        "SELECT metadata_json FROM audit_events WHERE request_id='safe-audit-test'",
      )
    ).rows[0];
    expect(event.metadata_json).toEqual({
      code: "INVALID_CREDENTIALS",
      count: 1,
    });
  });

  it("redige cookie, password e token nos logs capturados", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const cookie = await loginAs(h, h.fixtures.brokerA);
    h.app
      .getHttpAdapter()
      .getInstance()
      .log.info({
        marker: "redaction-test",
        cookie,
        password: "top-password-secret",
        token: "top-token-secret",
        headers: { cookie, authorization: "Bearer header-secret" },
        body: { password: "body-password-secret", token: "body-token-secret" },
      });
    const output = h.logs.join("");
    expect(output).toContain("redaction-test");
    expect(output).toContain("[REDACTED]");
    for (const secret of [
      cookie,
      cookie.split("=")[1],
      h.fixtures.brokerA.password,
      "top-password-secret",
      "top-token-secret",
      "header-secret",
      "body-password-secret",
      "body-token-secret",
    ])
      expect(output).not.toContain(secret);
  });

  it("configura origem, relógio e ambiente por instância sem alterar process.env", async () => {
    const before = { ...process.env };
    const [a, b] = await Promise.all([
      createHarness({
        nodeEnv: "production",
        allowedOrigin: "https://a.example.test",
      }),
      createHarness({
        nodeEnv: "test",
        allowedOrigin: "https://b.example.test",
      }),
    ]);
    harnesses.push(a, b);
    expect(process.env).toEqual(before);
    const login = (h: TestHarness, origin: string) =>
      h.http.post("/api/auth/login").set("Origin", origin).send({
        email: h.fixtures.brokerA.email,
        password: h.fixtures.brokerA.password,
      });
    const responseA = await login(a, "https://a.example.test");
    const responseB = await login(b, "https://b.example.test");
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(String(responseA.headers["set-cookie"])).toContain("; Secure");
    expect(String(responseB.headers["set-cookie"])).not.toContain("; Secure");
    expect((await login(a, "https://b.example.test")).status).toBe(403);
    a.clock.advance(8 * 60 * 60_000);
    expect(
      (
        await a.http
          .get("/api/auth/me")
          .set("Cookie", String(responseA.headers["set-cookie"]).split(";")[0])
      ).status,
    ).toBe(401);
    expect(
      (
        await b.http
          .get("/api/auth/me")
          .set("Cookie", String(responseB.headers["set-cookie"]).split(";")[0])
      ).status,
    ).toBe(200);
  });

  it("usa cookie opaco e revalida membership suspensa", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const actor = h.fixtures.brokerA;
    const cookie = await loginAs(h, actor);
    expect(cookie).toMatch(/^crm_session=[A-Za-z0-9_-]{43}$/);
    await h.ownerPool.query(
      "UPDATE workspace_memberships SET status=$1 WHERE id=$2",
      ["suspended", actor.membershipId],
    );
    const response = await h.http.get("/api/auth/me").set("Cookie", cookie);
    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty("broker_id");
  });

  it("retorna o mesmo erro para usuário ausente e senha inválida", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const invalidPassword = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({
        email: h.fixtures.brokerA.email,
        password: "incorrect-password",
      });
    const missingUser = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email: "missing@example.test", password: "incorrect-password" });
    expect(invalidPassword.status).toBe(401);
    expect(missingUser.status).toBe(401);
    expect(invalidPassword.body.code).toBe("INVALID_CREDENTIALS");
    expect(missingUser.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("exige contexto explícito para múltiplos workspaces depois de validar a senha", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const actor = h.fixtures.supervisor;
    const invalid = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email: actor.email, password: "incorrect-password" });
    expect(invalid.status).toBe(401);
    expect(invalid.body).not.toHaveProperty("options");
    const ambiguous = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email: actor.email, password: actor.password });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.code).toBe("WORKSPACE_CONTEXT_REQUIRED");
    // Names let the UI offer a readable choice; only this user's workspaces.
    expect(ambiguous.body.options).toEqual([
      { workspace_id: actor.workspaceId, name: "Pacaembu local" },
      {
        workspace_id: h.fixtures.multiWorkspace.workspaceId,
        name: "Workspace C",
      },
    ]);
    const cookie = await loginAs(h, h.fixtures.multiWorkspace);
    const me = await h.http.get("/api/auth/me").set("Cookie", cookie);
    expect(me.body).toMatchObject({
      role: "supervisor",
      broker_id: null,
      workspace_id: h.fixtures.multiWorkspace.workspaceId,
      workspace_name: "Workspace C",
    });
  });

  it("rejeita workspace de outra conta e ignora role enviada pelo cliente", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const actor = h.fixtures.brokerA;
    const forbidden = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({
        email: actor.email,
        password: actor.password,
        workspace_id: h.fixtures.brokerC.workspaceId,
      });
    expect(forbidden.status).toBe(403);
    const login = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({
        email: actor.email,
        password: actor.password,
        workspace_id: actor.workspaceId,
        role: "supervisor",
      });
    expect(login.body.role).toBe("broker");
  });

  it("expira e revoga a sessão no logout", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const logout = await h.http
      .post("/api/auth/logout")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000");
    expect(logout.status).toBe(204);
    expect(String(logout.headers["set-cookie"])).toContain("Max-Age=0");
    expect(
      (await h.http.get("/api/auth/me").set("Cookie", cookie)).status,
    ).toBe(401);
    const freshCookie = await loginAs(h, h.fixtures.brokerA);
    h.clock.advance(8 * 60 * 60 * 1000);
    expect(
      (await h.http.get("/api/auth/me").set("Cookie", freshCookie)).status,
    ).toBe(401);
  });

  it("limita tentativas por IP e email com Retry-After", async () => {
    const h = await createHarness();
    harnesses.push(h);
    let response;
    for (let attempt = 0; attempt < 11; attempt++) {
      response = await h.http
        .post("/api/auth/login")
        .set("Origin", "http://localhost:3000")
        .set("X-Real-IP", `192.0.2.${attempt}`)
        .set("X-Forwarded-For", `198.51.100.${attempt}`)
        .set("Forwarded", `for=203.0.113.${attempt}`)
        .send({
          email: attempt % 2 ? "LIMITED@example.test" : "limited@example.test",
          password: "incorrect-password",
        });
      expect(response.status).toBe(attempt < 10 ? 401 : 429);
    }
    expect(response!.status).toBe(429);
    expect(response!.headers["retry-after"]).toBe("900");
    expect(response!.headers["cache-control"]).toBe("no-store");
    h.clock.advance(15 * 60_000);
    const reset = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email: "limited@example.test", password: "incorrect-password" });
    expect(reset.status).toBe(401);
  });
  it("limita 100 tentativas por IP mesmo variando email e headers forjados", async () => {
    const h = await createHarness();
    harnesses.push(h);
    for (let attempt = 1; attempt <= 101; attempt++) {
      const response = await h.http
        .post("/api/auth/login")
        .set("Origin", "http://localhost:3000")
        .set("X-Forwarded-For", `192.0.2.${attempt}`)
        .send({
          email: `unknown-${attempt}@example.test`,
          password: "incorrect-password",
        });
      expect(response.status).toBe(attempt <= 100 ? 401 : 429);
      if (attempt === 101) expect(response.headers["retry-after"]).toBe("900");
    }
  });
});
