import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LeadPageSchema,
  LeadSchema,
  ProblemSchema,
  type Lead,
} from "@pacaembu/contracts";
import { createHarness, type TestHarness } from "../helpers/harness.js";
import { loginAs } from "../helpers/auth.js";

describe("leads HTTP", () => {
  let h: TestHarness;

  beforeEach(async () => {
    h = await createHarness();
  });

  afterEach(async () => {
    await h.close();
  });

  it("cria lead no escopo da sessão e descarta identidade enviada no body", async () => {
    const cookie = await loginAs(h, h.fixtures.brokerA);

    const response = await h.http
      .post("/api/leads")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .send({
        name: "Maria de teste",
        phone: "(11) 99999-0000",
        email: "maria@example.test",
        source: "site",
        interest: "Apartamento",
        broker_id: h.fixtures.brokerB.brokerId,
        workspace_id: h.fixtures.brokerC.workspaceId,
      });

    expect(response.status).toBe(201);
    const lead = LeadSchema.parse(response.body);
    expect(lead).toMatchObject({
      broker_id: h.fixtures.brokerA.brokerId,
      name: "Maria de teste",
      phone: "+5511999990000",
      email: "maria@example.test",
      source: "site",
      interest: "Apartamento",
      next_action: null,
      stage: "novo",
    });
    const audit = await h.ownerPool.query(
      "SELECT event_type, metadata_json FROM audit_events WHERE resource_id=$1",
      [lead.id],
    );
    expect(audit.rows).toEqual([
      {
        event_type: "lead.created",
        metadata_json: { lead_id: lead.id },
      },
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain("99999");
    expect(JSON.stringify(audit.rows)).not.toContain("maria@example.test");
  });

  it("isola GET, PATCH e listas entre broker B e workspace C", async () => {
    const cookieA = await loginAs(h, h.fixtures.brokerA);
    const cookieB = await loginAs(h, h.fixtures.brokerB);
    const cookieC = await loginAs(h, h.fixtures.brokerC);
    const leadA = await createLead(cookieA, "Lead Carteira A");
    const leadB = await createLead(cookieB, "Lead Carteira B");
    const leadC = await createLead(cookieC, "Lead Carteira C");

    for (const cookie of [cookieB, cookieC]) {
      const get = await h.http
        .get(`/api/leads/${leadA.id}`)
        .set("Cookie", cookie);
      expect(get.status).toBe(404);

      const patch = await h.http
        .patch(`/api/leads/${leadA.id}`)
        .set("Cookie", cookie)
        .set("Origin", h.origin)
        .send({ name: "Tentativa externa" });
      expect(patch.status).toBe(404);
    }

    const listA = await h.http.get("/api/leads").set("Cookie", cookieA);
    expect(listA.status).toBe(200);
    const pageA = LeadPageSchema.parse(listA.body);
    expect(pageA.items.map((lead) => lead.id)).toContain(leadA.id);
    expect(pageA.items.map((lead) => lead.id)).not.toEqual(
      expect.arrayContaining([leadB.id, leadC.id]),
    );
  });

  it("PATCH não aceita trocar o dono do lead", async () => {
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const created = await createLead(cookie, "Maria de teste");

    const changed = await h.http
      .patch(`/api/leads/${created.id}`)
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .send({
        name: "Maria atualizada",
        broker_id: h.fixtures.brokerB.brokerId,
        workspace_id: h.fixtures.brokerC.workspaceId,
      });

    expect(changed.status).toBe(200);
    const lead = LeadSchema.parse(changed.body);
    expect(lead.broker_id).toBe(h.fixtures.brokerA.brokerId);
    expect(lead.name).toBe("Maria atualizada");
    const audit = await h.ownerPool.query(
      "SELECT event_type, metadata_json FROM audit_events WHERE resource_id=$1 ORDER BY created_at",
      [created.id],
    );
    expect(audit.rows.at(-1)).toEqual({
      event_type: "lead.updated",
      metadata_json: { fields: "name", lead_id: created.id },
    });
  });

  it("valida UUID, input inválido, etapa e telefones BR/internacionais", async () => {
    const cookie = await loginAs(h, h.fixtures.brokerA);

    const badUuid = await h.http
      .get("/api/leads/not-a-uuid")
      .set("Cookie", cookie);
    expect(badUuid.status).toBe(422);
    expect(ProblemSchema.parse(badUuid.body).code).toBe("VALIDATION_ERROR");

    const missing = await h.http
      .get("/api/leads/00000000-0000-4000-8000-999999999999")
      .set("Cookie", cookie);
    expect(missing.status).toBe(404);

    const invalidBody = await h.http
      .post("/api/leads")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .send({ name: "A" });
    expect(invalidBody.status).toBe(422);

    const invalidStage = await h.http
      .patch(`/api/leads/${(await createLead(cookie, "Lead para etapa")).id}`)
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .send({ stage: "enviado" });
    expect(invalidStage.status).toBe(422);

    const invalidPhone = await h.http
      .post("/api/leads")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .send({ name: "Telefone ruim", phone: "123" });
    expect(invalidPhone.status).toBe(422);

    const br = await createLead(cookie, "Telefone BR", {
      phone: "(21) 98888-7777",
    });
    expect(br.phone).toBe("+5521988887777");

    const international = await createLead(cookie, "Telefone internacional", {
      phone: "+1 415 555 2671",
    });
    expect(international.phone).toBe("+14155552671");

    const nullable = await createLead(cookie, "Telefone nulo", {
      phone: null,
    });
    expect(nullable.phone).toBeNull();
  });

  it("pagina com busca parametrizada e persiste após reiniciar a app no mesmo schema", async () => {
    const cookie = await loginAs(h, h.fixtures.brokerA);
    const first = await createLead(cookie, "Ana SQL % _ ' lead", {
      interest: "Jardim",
    });
    await createLead(cookie, "Bruno Busca");
    await createLead(cookie, "Carla Busca");

    const searched = await h.http
      .get(
        `/api/leads?page=1&page_size=1&search=${encodeURIComponent("% _ '")}`,
      )
      .set("Cookie", cookie);
    expect(searched.status).toBe(200);
    expect(LeadPageSchema.parse(searched.body)).toMatchObject({
      items: [expect.objectContaining({ id: first.id })],
      page: { page: 1, page_size: 1, total: 1 },
    });

    const limited = await h.http
      .get("/api/leads?page=2&page_size=2")
      .set("Cookie", cookie);
    expect(limited.status).toBe(200);
    const page = LeadPageSchema.parse(limited.body);
    expect(page.items).toHaveLength(1);
    expect(page.page).toEqual({ page: 2, page_size: 2, total: 3 });

    await h.restartApp();
    const afterRestart = await h.http
      .get(`/api/leads/${first.id}`)
      .set("Cookie", cookie);
    expect(afterRestart.status).toBe(200);
    expect(LeadSchema.parse(afterRestart.body).id).toBe(first.id);
  });

  async function createLead(
    cookie: string,
    name: string,
    extra: Record<string, unknown> = {},
  ): Promise<Lead> {
    const response = await h.http
      .post("/api/leads")
      .set("Cookie", cookie)
      .set("Origin", h.origin)
      .send({ name, ...extra });
    expect(response.status).toBe(201);
    return LeadSchema.parse(response.body);
  }
});
