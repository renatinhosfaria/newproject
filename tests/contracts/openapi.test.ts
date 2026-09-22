import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { parse } from "yaml";

const openapiPath = new URL("../../docs/api/openapi.yaml", import.meta.url);

describe("OpenAPI contract", () => {
  it("is a valid OpenAPI 3.1 document with only preparatory-cycle routes", async () => {
    const raw = await readFile(openapiPath, "utf8");
    const document = parse(raw) as Record<string, unknown>;
    const api = (await SwaggerParser.validate(parse(raw) as never)) as any;
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
    // Workspace choice after an authenticated 409 carries readable names.
    expect(api.components?.schemas?.SessionUser?.required).toContain(
      "workspace_name",
    );
    expect(
      (api.components?.schemas?.Problem as any)?.properties?.options?.items
        ?.required,
    ).toEqual(["workspace_id", "name"]);

    const operations = {
      "/api/auth/login": { post: ["200", "401", "409", "422", "429"] },
      "/api/auth/logout": { post: ["204", "401", "403"] },
      "/api/auth/me": { get: ["200", "401"] },
      "/api/leads": {
        get: ["200", "401", "403", "422"],
        post: ["201", "401", "403", "422"],
      },
      "/api/leads/{leadId}": {
        get: ["200", "401", "404"],
        patch: ["200", "401", "403", "404", "422"],
      },
      "/api/conversations": {
        get: ["200", "401", "403"],
        post: ["201", "401", "403", "409", "422"],
      },
      "/api/conversations/{conversationId}": {
        get: ["200", "401", "404"],
      },
      "/api/conversations/{conversationId}/messages": {
        get: ["200", "401", "404"],
      },
      "/api/agents": { get: ["200", "401"] },
      "/api/agent-sessions": {
        post: ["201", "401", "403", "409", "422"],
      },
      "/api/agent-sessions/{sessionId}": {
        get: ["200", "401", "404"],
      },
      "/api/agent-sessions/{sessionId}/messages": {
        post: ["202", "401", "403", "404", "409", "422", "503"],
      },
      "/api/agent-sessions/{sessionId}/events": {
        get: ["200", "401", "404", "410", "422"],
      },
    } as const;

    for (const [path, methods] of Object.entries(operations)) {
      for (const [method, statuses] of Object.entries(methods)) {
        const operation = api.paths[path][method];
        expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined();
        for (const status of statuses) {
          expect(
            operation.responses[status],
            `${method.toUpperCase()} ${path} ${status}`,
          ).toBeDefined();
        }
      }
    }

    const responseSchemaRefs = [
      ["/api/auth/login", "post", "200", "SessionUser"],
      ["/api/leads", "post", "201", "Lead"],
      ["/api/leads/{leadId}", "patch", "200", "Lead"],
      ["/api/conversations", "post", "201", "Conversation"],
      ["/api/agent-sessions", "post", "201", "AgentSession"],
      [
        "/api/agent-sessions/{sessionId}/messages",
        "post",
        "202",
        "AgentRunAccepted",
      ],
    ] as const;
    for (const [path, method, status, schema] of responseSchemaRefs) {
      expect(
        (document as any).paths[path][method].responses[status].content[
          "application/json"
        ].schema.$ref,
      ).toBe(`#/components/schemas/${schema}`);
    }

    expect(
      api.paths["/api/agent-sessions/{sessionId}/events"].get.responses["200"]
        .content["text/event-stream"].schema,
    ).toMatchObject({ type: "string" });
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
    expect(api.components.parameters.IdempotencyKey.required).toBe(true);
    expect(api.components.schemas.AgentRun.required).toEqual(
      expect.arrayContaining([
        "run_id",
        "session_id",
        "status",
        "input_content",
        "result",
        "error_code",
      ]),
    );
    expect(api.components.schemas.AgentRun.properties.result).toMatchObject({
      oneOf: expect.arrayContaining([
        expect.objectContaining({
          $ref: "#/components/schemas/AgentResult",
        }),
        expect.objectContaining({ type: "null" }),
      ]),
    });
    expect(api.components.schemas.AgentEvent.required).toEqual(
      expect.arrayContaining([
        "id",
        "run_id",
        "session_id",
        "workspace_id",
        "broker_id",
        "sequence",
        "type",
        "data",
        "request_id",
        "occurred_at",
      ]),
    );
    expect(api.components.schemas.PersistedAgentEvent.required).toEqual(
      expect.arrayContaining(["payload"]),
    );
    expect(api.components.schemas.AgentSession.required).toContain("runs");
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
