import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type TestHarness } from "../helpers/harness.js";
import { loginAs } from "../helpers/auth.js";

describe("autenticação revogável", () => {
  const harnesses: TestHarness[] = [];
  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((h) => h.close()));
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
    const ambiguous = await h.http
      .post("/api/auth/login")
      .set("Origin", "http://localhost:3000")
      .send({ email: actor.email, password: actor.password });
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.code).toBe("WORKSPACE_CONTEXT_REQUIRED");
    const cookie = await loginAs(h, h.fixtures.multiWorkspace);
    const me = await h.http.get("/api/auth/me").set("Cookie", cookie);
    expect(me.body).toMatchObject({
      role: "supervisor",
      broker_id: null,
      workspace_id: h.fixtures.multiWorkspace.workspaceId,
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
        .set("X-Real-IP", "192.0.2.10")
        .send({
          email: "limited@example.test",
          password: "incorrect-password",
        });
    }
    expect(response!.status).toBe(429);
    expect(response!.headers["retry-after"]).toBeTruthy();
  });
});
