import { describe, expect, it } from "vitest";
import {
  AgentMessageRequestSchema,
  AgentResultSchema,
  CreateAgentSessionRequestSchema,
  CreateConversationRequestSchema,
  CreateLeadRequestSchema,
  IdempotencyKeySchema,
  LoginRequestSchema,
  PageQuerySchema,
  UuidSchema,
  canTransitionMessage,
} from "@pacaembu/contracts";

describe("shared contract schemas", () => {
  it("accepts workspace context but never trusts a client role", () => {
    const parsed = LoginRequestSchema.parse({
      email: "teste@example.test",
      password: "somente-teste",
      workspace_id: "00000000-0000-4000-8000-000000000001",
      role: "admin",
    });
    expect(parsed).not.toHaveProperty("role");
  });

  it("rejects an approval-capable simulated Agent result", () => {
    expect(
      AgentResultSchema.safeParse({
        type: "draft",
        content: "Oi",
        citations: [],
        proposed_actions: [],
        requires_approval: true,
        status: "completed",
        request_id: "r1",
      }).success,
    ).toBe(false);
    expect(canTransitionMessage("draft", "sent")).toBe(false);
  });

  it("enforces content and name boundaries and strips identity fields", () => {
    expect(CreateLeadRequestSchema.safeParse({}).success).toBe(false);
    expect(AgentMessageRequestSchema.safeParse({}).success).toBe(false);
    expect(CreateLeadRequestSchema.safeParse({ name: "A" }).success).toBe(
      false,
    );
    expect(
      CreateLeadRequestSchema.safeParse({ name: "A".repeat(161) }).success,
    ).toBe(false);
    const lead = CreateLeadRequestSchema.parse({
      name: "Ana",
      broker_id: "not-client-authority",
    });
    expect(lead).not.toHaveProperty("broker_id");
    expect(AgentMessageRequestSchema.safeParse({ content: "" }).success).toBe(
      false,
    );
    expect(
      AgentMessageRequestSchema.safeParse({ content: "x".repeat(12001) })
        .success,
    ).toBe(false);
  });

  it("enforces UUID, idempotency and pagination boundaries", () => {
    expect(UuidSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(IdempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(IdempotencyKeySchema.safeParse("k".repeat(129)).success).toBe(false);
    expect(IdempotencyKeySchema.safeParse("k".repeat(16)).success).toBe(true);
    expect(PageQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(PageQuerySchema.safeParse({ page_size: 101 }).success).toBe(false);
    expect(PageQuerySchema.safeParse({ page: 1, page_size: 100 }).success).toBe(
      true,
    );
  });

  it("strips server-owned identity fields from every client DTO", () => {
    const identity = {
      workspace_id: "client-workspace",
      broker_id: "client-broker",
      user_id: "client-user",
      role: "admin",
    };

    expect(
      CreateConversationRequestSchema.parse({
        lead_id: "00000000-0000-4000-8000-000000000001",
        ...identity,
      }),
    ).toEqual({ lead_id: "00000000-0000-4000-8000-000000000001" });
    expect(
      CreateAgentSessionRequestSchema.parse({
        agent_id: "atendimento",
        ...identity,
      }),
    ).toEqual({ agent_id: "atendimento" });
    expect(
      AgentMessageRequestSchema.parse({ content: "Oi", ...identity }),
    ).toEqual({ content: "Oi" });
  });
});
