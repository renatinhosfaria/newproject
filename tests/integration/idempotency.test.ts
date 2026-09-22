import { afterEach, describe, expect, it } from "vitest";
import { IdempotencyService } from "../../apps/api/src/idempotency/idempotency.service.js";
import { conversations } from "../../apps/api/src/db/schema.js";
import type { Tx } from "../../apps/api/src/db/client.js";
import type { BrokerContext } from "@pacaembu/contracts";
import { maintenance } from "../../db/maintenance.js";
import { createHarness, type TestHarness } from "../helpers/harness.js";

describe("IdempotencyService", () => {
  const harnesses: TestHarness[] = [];

  afterEach(async () => {
    await Promise.all(harnesses.splice(0).map((h) => h.close()));
  });

  it("duas chamadas concorrentes produzem uma conversa", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const service = h.app.get(IdempotencyService);
    const context = brokerContext(h, "idem-concurrent-request");
    const leadId = await createLead(h, "Lead Concorrente");
    const input = { lead_id: leadId, title: "Atendimento" };
    const key = "conversation-test-key-001";

    const createConversation = (tx: Tx) =>
      tx
        .insert(conversations)
        .values({
          workspaceId: context.workspace_id,
          brokerId: context.broker_id,
          leadId: input.lead_id,
          status: "open",
        })
        .returning()
        .then(([row]) => ({
          status: 201,
          body: {
            id: row.id,
            lead_id: row.leadId,
            request_id: context.request_id,
          },
        }));

    const results = await Promise.all([
      service.execute(
        context,
        "POST /api/conversations",
        key,
        input,
        createConversation,
      ),
      service.execute(
        context,
        "POST /api/conversations",
        key,
        { title: "Atendimento", lead_id: leadId },
        createConversation,
      ),
    ]);

    expect(results[0]).toEqual(results[1]);
    const persisted = await h.pool.query(
      "SELECT count(*)::int AS n FROM conversations WHERE lead_id=$1",
      [input.lead_id],
    );
    expect(persisted.rows[0].n).toBe(1);
  });

  it("isola a mesma chave por operation concreta", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const service = h.app.get(IdempotencyService);
    const context = brokerContext(h, "idem-operation-scope");
    const firstLeadId = await createLead(h, "Lead A");
    const secondLeadId = await createLead(h, "Lead B");
    const key = "conversation-test-key-002";

    const first = await service.execute(
      context,
      `POST /api/leads/${firstLeadId}/conversations`,
      key,
      { lead_id: firstLeadId },
      createConversationFor(context, firstLeadId),
    );
    const second = await service.execute(
      context,
      `POST /api/leads/${secondLeadId}/conversations`,
      key,
      { lead_id: secondLeadId },
      createConversationFor(context, secondLeadId),
    );

    expect(first.body.id).not.toBe(second.body.id);
    const persisted = await h.pool.query(
      "SELECT count(*)::int AS n FROM conversations WHERE lead_id = ANY($1::uuid[])",
      [[firstLeadId, secondLeadId]],
    );
    expect(persisted.rows[0].n).toBe(2);
  });

  it("retorna 409 e não executa a mutação quando a mesma chave recebe corpo diferente", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const service = h.app.get(IdempotencyService);
    const context = brokerContext(h, "idem-conflict-request");
    const leadId = await createLead(h, "Lead Conflito");
    const key = "conversation-test-key-003";

    await service.execute(
      context,
      "POST /api/conversations",
      key,
      { lead_id: leadId },
      createConversationFor(context, leadId),
    );

    await expect(
      service.execute(
        context,
        "POST /api/conversations",
        key,
        { lead_id: leadId, title: "corpo diferente" },
        createConversationFor(context, leadId),
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
    const persisted = await h.pool.query(
      "SELECT count(*)::int AS n FROM conversations WHERE lead_id=$1",
      [leadId],
    );
    expect(persisted.rows[0].n).toBe(1);
  });

  it("replay preserva o corpo e request_id gravados originalmente", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const service = h.app.get(IdempotencyService);
    const originalContext = brokerContext(h, "idem-original-request");
    const replayContext = brokerContext(h, "idem-replay-request");
    const leadId = await createLead(h, "Lead Replay");
    const key = "conversation-test-key-003b";

    const first = await service.execute(
      originalContext,
      "POST /api/conversations",
      key,
      { lead_id: leadId },
      createConversationFor(originalContext, leadId),
    );
    const replay = await service.execute(
      replayContext,
      "POST /api/conversations",
      key,
      { lead_id: leadId },
      createConversationFor(replayContext, leadId),
    );

    expect(replay).toEqual(first);
    expect(replay.body.request_id).toBe("idem-original-request");
  });

  it("não grava replay quando a mutação faz rollback", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const service = h.app.get(IdempotencyService);
    const context = brokerContext(h, "idem-rollback-request");
    const leadId = await createLead(h, "Lead Rollback");
    const key = "conversation-test-key-004";

    await expect(
      service.execute(
        context,
        "POST /api/conversations",
        key,
        { lead_id: leadId },
        async (tx) => {
          await createConversationFor(context, leadId)(tx);
          throw new Error("boom after local effect");
        },
      ),
    ).rejects.toThrow("boom after local effect");

    const beforeReplay = await h.pool.query(
      "SELECT count(*)::int AS n FROM conversations WHERE lead_id=$1",
      [leadId],
    );
    expect(beforeReplay.rows[0].n).toBe(0);

    const retry = await service.execute(
      context,
      "POST /api/conversations",
      key,
      { lead_id: leadId },
      createConversationFor(context, leadId),
    );
    expect(retry.status).toBe(201);
    const afterReplay = await h.pool.query(
      "SELECT count(*)::int AS n FROM conversations WHERE lead_id=$1",
      [leadId],
    );
    expect(afterReplay.rows[0].n).toBe(1);
  });

  it("expira registros por ManualClock e permite executar de novo após manutenção", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const service = h.app.get(IdempotencyService);
    const context = brokerContext(h, "idem-expiry-request");
    const leadId = await createLead(h, "Lead Expirado");
    const key = "conversation-test-key-005";
    const operation = "POST /api/conversations";

    const first = await service.execute(
      context,
      operation,
      key,
      { lead_id: leadId },
      createConversationFor(context, leadId),
    );
    h.clock.advance(24 * 60 * 60 * 1000 + 1);
    await maintenance(h.ownerPool, h.clock.now());
    const second = await service.execute(
      context,
      operation,
      key,
      { lead_id: leadId },
      createConversationFor(context, leadId),
    );

    expect(first.body.id).not.toBe(second.body.id);
    const persisted = await h.pool.query(
      "SELECT count(*)::int AS n FROM conversations WHERE lead_id=$1",
      [leadId],
    );
    expect(persisted.rows[0].n).toBe(2);
  });

  it("bloqueia replay quando o broker foi suspenso antes da nova autorização", async () => {
    const h = await createHarness();
    harnesses.push(h);
    const service = h.app.get(IdempotencyService);
    const activeContext = brokerContext(h, "idem-suspended-original");
    const leadId = await createLead(h, "Lead Suspenso");
    const key = "conversation-test-key-006";

    await service.execute(
      activeContext,
      "POST /api/conversations",
      key,
      { lead_id: leadId },
      createConversationFor(activeContext, leadId),
    );
    await h.ownerPool.query(
      "UPDATE brokers SET status='suspended' WHERE id=$1",
      [activeContext.broker_id],
    );

    await expect(
      service.execute(
        brokerContext(h, "idem-suspended-replay"),
        "POST /api/conversations",
        key,
        { lead_id: leadId },
        createConversationFor(activeContext, leadId),
      ),
    ).rejects.toMatchObject({ status: 403, code: "BROKER_SUSPENDED" });
  });
});

function brokerContext(h: TestHarness, requestId: string): BrokerContext {
  const actor = h.fixtures.brokerA;
  if (!actor.brokerId) throw new Error("broker fixture requires brokerId");
  return {
    user_id: actor.userId,
    workspace_id: actor.workspaceId,
    membership_id: actor.membershipId,
    broker_id: actor.brokerId,
    role: "broker",
    request_id: requestId,
  };
}

async function createLead(h: TestHarness, name: string): Promise<string> {
  const actor = h.fixtures.brokerA;
  const result = await h.pool.query(
    "INSERT INTO leads (workspace_id, broker_id, name, stage) VALUES ($1,$2,$3,'novo') RETURNING id",
    [actor.workspaceId, actor.brokerId, name],
  );
  return result.rows[0].id;
}

function createConversationFor(context: BrokerContext, leadId: string) {
  return async (tx: Tx) => {
    const [row] = await tx
      .insert(conversations)
      .values({
        workspaceId: context.workspace_id,
        brokerId: context.broker_id,
        leadId,
        status: "open",
      })
      .returning();
    return {
      status: 201,
      body: {
        id: row.id,
        lead_id: row.leadId,
        request_id: context.request_id,
      },
    };
  };
}
