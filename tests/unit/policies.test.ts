import { describe, expect, it } from "vitest";
import type { SessionUser } from "@pacaembu/contracts";
import { requireBroker } from "../../apps/api/src/auth/policies.js";
import { ProblemError } from "../../apps/api/src/http/problem.filter.js";
import { assertBrowserOrigin } from "../../apps/api/src/auth/csrf.js";
import { LoginRateLimiter } from "../../apps/api/src/auth/rate-limit.js";
import { ManualClock } from "../helpers/clock.js";

const user = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: "00000000-0000-4000-8000-000000000001",
  membership_id: "00000000-0000-4000-8000-000000000002",
  name: "Broker",
  email: "broker@example.test",
  role: "broker",
  workspace_id: "00000000-0000-4000-8000-000000000003",
  workspace_name: "Workspace de teste",
  broker_id: "00000000-0000-4000-8000-000000000004",
  ...overrides,
});

describe("proteções de autenticação", () => {
  it("aceita Referer da origem permitida e rejeita Origin malicioso prioritário", () => {
    expect(() =>
      assertBrowserOrigin(
        { referer: "https://crm.example.test/login" },
        "https://crm.example.test",
      ),
    ).not.toThrow();
    expect(() =>
      assertBrowserOrigin(
        {
          origin: "https://crm.example.test.evil.test",
          referer: "https://crm.example.test/login",
        },
        "https://crm.example.test",
      ),
    ).toThrowError(expect.objectContaining({ code: "CSRF_ORIGIN_INVALID" }));
  });

  it("conta IP+email normalizado sem bloquear o mesmo email em outro IP", () => {
    const limiter = new LoginRateLimiter(new ManualClock());
    for (let i = 0; i < 10; i++)
      limiter.check("192.0.2.1", " USER@example.test ");
    expect(() => limiter.check("192.0.2.1", "user@example.test")).toThrowError(
      expect.objectContaining({ status: 429 }),
    );
    expect(() => limiter.check("192.0.2.2", "user@example.test")).not.toThrow();
  });

  it("reinicia a janela de rate limit pelo relógio controlado", () => {
    const clock = new ManualClock();
    const limiter = new LoginRateLimiter(clock, 1, 100);
    limiter.check("192.0.2.1", "USER@example.test");
    expect(() => limiter.check("192.0.2.1", "user@example.test")).toThrowError(
      expect.objectContaining({ status: 429 }),
    );
    clock.advance(15 * 60_000);
    expect(() => limiter.check("192.0.2.1", "user@example.test")).not.toThrow();
  });
});

describe("policies", () => {
  it("deriva o contexto da carteira a partir da sessão", () => {
    expect(requireBroker(user(), "req-1")).toEqual({
      user_id: user().id,
      workspace_id: user().workspace_id,
      membership_id: user().membership_id,
      broker_id: user().broker_id,
      role: "broker",
      request_id: "req-1",
    });
  });

  it("rejeita supervisor sem broker com erro uniforme", () => {
    expect(() =>
      requireBroker(user({ role: "supervisor", broker_id: null }), "req-2"),
    ).toThrowError(
      expect.objectContaining({
        status: 403,
        code: "BROKER_CONTEXT_REQUIRED",
      }) satisfies Partial<ProblemError>,
    );
  });
});
