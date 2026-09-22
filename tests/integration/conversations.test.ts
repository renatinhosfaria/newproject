import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ConversationPageSchema,
  ConversationSchema,
  MessagePageSchema,
  ProblemSchema,
  type Conversation,
  type Lead,
} from "@pacaembu/contracts";
import { createHarness, type TestHarness } from "../helpers/harness.js";
import { loginAs } from "../helpers/auth.js";

describe("conversations HTTP", () => {
  let h: TestHarness;

  beforeEach(async () => {
    h = await createHarness();
  });

  afterEach(async () => {
    await h.close();
  });

  it("cria conversa idempotente para lead autorizado e reexecuta replay", async () => {
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const lead = await createLead(cookie, "Lead Conversa");
    const key = "conversation-http-key-001";

    const first = await h.http
      .post("/api/conversations")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .set("Idempotency-Key", key)
      .set("x-request-id", "conversation-original")
      .send({
        lead_id: lead.id,
        broker_id: h.fixtures.brokerB.brokerId,
        workspace_id: h.fixtures.brokerC.workspaceId,
      });
    expect(first.status).toBe(201);
    const conversation = ConversationSchema.parse(first.body);
    expect(conversation).toMatchObject({
      broker_id: h.fixtures.brokerA.brokerId,
      lead_id: lead.id,
      status: "open",
      last_message_at: null,
    });

    const replay = await h.http
      .post("/api/conversations")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .set("Idempotency-Key", key)
      .set("x-request-id", "conversation-replay")
      .send({ lead_id: lead.id });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);

    const rows = await h.ownerPool.query(
      "SELECT count(*)::int AS n FROM conversations WHERE lead_id=$1",
      [lead.id],
    );
    expect(rows.rows[0].n).toBe(1);
    const audit = await h.ownerPool.query(
      "SELECT event_type, metadata_json FROM audit_events WHERE resource_id=$1",
      [conversation.id],
    );
    expect(audit.rows).toEqual([
      {
        event_type: "conversation.created",
        metadata_json: {
          conversation_id: conversation.id,
          lead_id: lead.id,
        },
      },
    ]);
  });

  it("retorna 409 quando a mesma chave idempotente recebe outro corpo", async () => {
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const lead = await createLead(cookie, "Lead Idempotente");
    const other = await createLead(cookie, "Lead Outro Corpo");
    const key = "conversation-http-key-002";

    await expectConversation(cookie, lead.id, key, 201);
    const conflict = await h.http
      .post("/api/conversations")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .set("Idempotency-Key", key)
      .send({ lead_id: other.id });

    expect(conflict.status).toBe(409);
    expect(ProblemSchema.parse(conflict.body).code).toBe(
      "IDEMPOTENCY_KEY_REUSED",
    );
  });

  it("revalida acesso ao lead antes de devolver replay idempotente", async () => {
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const lead = await createLead(cookie, "Lead Replay Revogado");
    const key = "conversation-http-key-revoked";

    const first = await expectConversation(cookie, lead.id, key, 201);
    await h.ownerPool.query("DELETE FROM conversations WHERE id=$1", [
      first.id,
    ]);
    await h.ownerPool.query("DELETE FROM leads WHERE id=$1", [lead.id]);

    const replay = await h.http
      .post("/api/conversations")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .set("Idempotency-Key", key)
      .send({ lead_id: lead.id });

    expect(replay.status).toBe(404);
    expect(ProblemSchema.parse(replay.body).code).toBe("RESOURCE_NOT_FOUND");
    expect(JSON.stringify(replay.body)).not.toContain(first.id);
  });

  it("isola GET/lista/mensagens entre broker B e workspace C", async () => {
    const cookieA = await loginAs(h, h.fixtures.brokerA);
    const cookieB = await loginAs(h, h.fixtures.brokerB);
    const cookieC = await loginAs(h, h.fixtures.brokerC);
    const leadA = await createLead(cookieA, "Lead A Conversa");
    const leadB = await createLead(cookieB, "Lead B Conversa");
    const leadC = await createLead(cookieC, "Lead C Conversa");
    const conversationA = await createConversation(cookieA, leadA.id, "a");
    const conversationB = await createConversation(cookieB, leadB.id, "b");
    const conversationC = await createConversation(cookieC, leadC.id, "c");
    await insertSyntheticMessages(conversationA.id);

    for (const cookie of [cookieB, cookieC]) {
      const get = await h.http
        .get(`/api/conversations/${conversationA.id}`)
        .set("Cookie", cookie);
      expect(get.status).toBe(404);

      const messages = await h.http
        .get(`/api/conversations/${conversationA.id}/messages`)
        .set("Cookie", cookie);
      expect(messages.status).toBe(404);

      const denied = await h.http
        .post("/api/conversations")
        .set("Cookie", cookie)
        .set("Origin", h.origin)
        .set("Idempotency-Key", `conversation-denied-${cookie.length}`)
        .send({ lead_id: leadA.id });
      expect(denied.status).toBe(404);
    }

    const listA = await h.http.get("/api/conversations").set("Cookie", cookieA);
    expect(listA.status).toBe(200);
    const pageA = ConversationPageSchema.parse(listA.body);
    expect(pageA.items.map((conversation) => conversation.id)).toContain(
      conversationA.id,
    );
    expect(pageA.items.map((conversation) => conversation.id)).not.toEqual(
      expect.arrayContaining([conversationB.id, conversationC.id]),
    );
  });

  it("lista histórico e rascunhos da conversa autorizada", async () => {
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const lead = await createLead(cookie, "Lead Histórico");
    const conversation = await createConversation(cookie, lead.id, "history");
    await insertSyntheticMessages(conversation.id);

    const response = await h.http
      .get(`/api/conversations/${conversation.id}/messages?page=1&page_size=10`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    const page = MessagePageSchema.parse(response.body);
    expect(page.page).toEqual({ page: 1, page_size: 10, total: 2 });
    expect(page.items).toEqual([
      expect.objectContaining({
        conversation_id: conversation.id,
        direction: "inbound",
        author: "lead",
        status: "received",
        content: "Oi, tenho interesse",
      }),
      expect.objectContaining({
        conversation_id: conversation.id,
        direction: "outbound",
        author: "agent",
        status: "draft",
        content: "Olá! Posso te ajudar com esse imóvel.",
      }),
    ]);
  });

  it("valida UUID, input, paginação, busca e bloqueia supervisor", async () => {
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const supervisorCookie = await loginAs(h, h.fixtures.supervisor);
    const lead = await createLead(cookie, "Lead Busca SQL % _");
    const conversation = await createConversation(cookie, lead.id, "search");

    const supervisor = await h.http
      .get("/api/conversations")
      .set("Cookie", supervisorCookie);
    expect(supervisor.status).toBe(403);

    const badUuid = await h.http
      .get("/api/conversations/not-a-uuid")
      .set("Cookie", cookie);
    expect(badUuid.status).toBe(422);

    const missing = await h.http
      .get("/api/conversations/00000000-0000-4000-8000-999999999999")
      .set("Cookie", cookie);
    expect(missing.status).toBe(404);

    const invalidBody = await h.http
      .post("/api/conversations")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .set("Idempotency-Key", "conversation-http-key-003")
      .send({});
    expect(invalidBody.status).toBe(422);

    const searched = await h.http
      .get(
        `/api/conversations?page=1&page_size=1&search=${encodeURIComponent("% _")}`,
      )
      .set("Cookie", cookie);
    expect(searched.status).toBe(200);
    expect(ConversationPageSchema.parse(searched.body)).toMatchObject({
      items: [expect.objectContaining({ id: conversation.id })],
      page: { page: 1, page_size: 1, total: 1 },
    });

    const badPage = await h.http
      .get(`/api/conversations/${conversation.id}/messages?page=0`)
      .set("Cookie", cookie);
    expect(badPage.status).toBe(422);
  });

  async function createLead(cookie: string, name: string): Promise<Lead> {
    const response = await h.http
      .post("/api/leads")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .send({ name });
    expect(response.status).toBe(201);
    return response.body;
  }

  async function createConversation(
    cookie: string,
    leadId: string,
    suffix: string,
  ): Promise<Conversation> {
    return expectConversation(
      cookie,
      leadId,
      `conversation-http-${suffix}`,
      201,
    );
  }

  async function expectConversation(
    cookie: string,
    leadId: string,
    key: string,
    status: number,
  ): Promise<Conversation> {
    const response = await h.http
      .post("/api/conversations")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .set("Idempotency-Key", key)
      .send({ lead_id: leadId });
    expect(response.status).toBe(status);
    return ConversationSchema.parse(response.body);
  }

  async function insertSyntheticMessages(
    conversationId: string,
  ): Promise<void> {
    await h.ownerPool.query(
      `
      INSERT INTO messages (
        workspace_id,
        broker_id,
        conversation_id,
        direction,
        author,
        status,
        content,
        metadata_json,
        occurred_at
      )
      VALUES
        ($1,$2,$3,'inbound','lead','received','Oi, tenho interesse','{}'::jsonb,'2026-01-01T10:00:00Z'),
        ($1,$2,$3,'outbound','agent','draft','Olá! Posso te ajudar com esse imóvel.','{}'::jsonb,'2026-01-01T10:01:00Z')
      `,
      [
        h.fixtures.brokerA.workspaceId,
        h.fixtures.brokerA.brokerId,
        conversationId,
      ],
    );
  }
});
