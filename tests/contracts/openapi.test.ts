import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { parse } from "yaml";

const openapiPath = new URL("../../docs/api/openapi.yaml", import.meta.url);

describe("OpenAPI contract", () => {
  it("is a valid OpenAPI 3.1 document with only preparatory-cycle routes", async () => {
    const raw = await readFile(openapiPath, "utf8");
    const document = parse(raw) as Record<string, unknown>;
    const api = (await SwaggerParser.validate(document as never)) as any;
    expect(api.openapi).toBe("3.1.0");
    const paths = Object.keys(api.paths ?? {}).sort();
    expect(paths).toEqual([
      "/api/agent-sessions",
      "/api/agent-sessions/{sessionId}",
      "/api/agent-sessions/{sessionId}/events",
      "/api/agent-sessions/{sessionId}/messages",
      "/api/agents",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/me",
      "/api/conversations",
      "/api/conversations/{conversationId}",
      "/api/conversations/{conversationId}/messages",
      "/api/leads",
      "/api/leads/{leadId}",
    ]);
    expect(
      paths.some(
        (path) => path.includes("hermes") || path.includes("dashboard"),
      ),
    ).toBe(false);
    expect(api.components?.schemas?.Problem).toMatchObject({
      required: expect.arrayContaining([
        "type",
        "title",
        "status",
        "code",
        "request_id",
        "retryable",
      ]),
    });

    expect(api.paths["/api/auth/logout"].post.responses["204"]).toBeDefined();
    expect(api.paths["/api/leads"].post.responses["201"]).toBeDefined();
    expect(
      api.paths["/api/agent-sessions/{sessionId}/messages"].post.responses[
        "202"
      ],
    ).toBeDefined();
  });

  it("documents event replay, cookies, status codes and preparatory errors", async () => {
    const raw = await readFile(openapiPath, "utf8");
    const api = parse(raw) as any;
    const events = api.paths["/api/agent-sessions/{sessionId}/events"].get;
    expect(events.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "run_id", in: "query" }),
        expect.objectContaining({ name: "Last-Event-ID", in: "header" }),
      ]),
    );
    expect(api.components.parameters.IdempotencyKey.schema.minLength).toBe(16);
    expect(api.components.parameters.IdempotencyKey.schema.maxLength).toBe(128);
    for (const code of [
      "WORKSPACE_CONTEXT_REQUIRED",
      "CSRF_ORIGIN_REQUIRED",
      "CSRF_ORIGIN_INVALID",
      "IDEMPOTENCY_KEY_REUSED",
      "EVENT_REPLAY_UNAVAILABLE",
      "INVALID_EVENT_CURSOR",
      "HERMES_PROFILE_UNAVAILABLE",
    ]) {
      expect(raw).toContain(code);
    }
  });
});
