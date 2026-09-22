import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type TestHarness } from "../helpers/harness.js";

describe("CSRF por origem", () => {
  const harnesses: TestHarness[] = [];
  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((h) => h.close()));
  });

  async function login(h: TestHarness, headers: Record<string, string>) {
    const actor = h.fixtures.brokerA;
    let request = h.http.post("/api/auth/login");
    for (const [name, value] of Object.entries(headers))
      request = request.set(name, value);
    return request.send({
      email: actor.email,
      password: actor.password,
      workspace_id: actor.workspaceId,
    });
  }

  it("rejeita Origin null e sufixo malicioso", async () => {
    const h = await createHarness();
    harnesses.push(h);
    expect((await login(h, { Origin: "null" })).body.code).toBe(
      "CSRF_ORIGIN_INVALID",
    );
    expect(
      (await login(h, { Origin: "http://localhost:3000.evil.test" })).body.code,
    ).toBe("CSRF_ORIGIN_INVALID");
  });

  it("aceita Referer com caminho quando Origin está ausente", async () => {
    const h = await createHarness();
    harnesses.push(h);
    expect(
      (await login(h, { Referer: "http://localhost:3000/login?next=%2F" }))
        .status,
    ).toBe(200);
  });

  it("não usa Referer válido para substituir Origin inválido", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const response = await login(h, {
      Origin: "https://evil.test",
      Referer: "http://localhost:3000/login",
    });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CSRF_ORIGIN_INVALID");
  });

  it("marca cookie Secure fora do ambiente local", async () => {
    const h = await createHarness({ nodeEnv: "production" });
    harnesses.push(h);
    const response = await login(h, { Origin: "http://localhost:3000" });
    expect(String(response.headers["set-cookie"])).toContain("; Secure");
  });
});
