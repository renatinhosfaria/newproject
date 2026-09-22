import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type {
  BrokerContext,
  Conversation,
  ConversationPage,
  CreateConversationRequest,
  Message,
  MessagePage,
} from "@pacaembu/contracts";
import { AuditService } from "../audit/audit.service.js";
import { DB } from "../auth/auth.service.js";
import { type Db, type Tx, withWorkspaceContext } from "../db/client.js";
import { conversations } from "../db/schema.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import { problem } from "../http/problem.filter.js";

export interface ConversationQuery {
  page: number;
  page_size: number;
  search?: string;
}

interface ConversationRow {
  id: string;
  broker_id: string;
  lead_id: string;
  status: "open" | "waiting" | "closed" | "archived";
  last_message_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  author: "lead" | "broker" | "agent" | "system";
  status: "received" | "processing" | "draft" | "failed";
  content: string;
  occurred_at: Date | string;
}

@Injectable()
export class ConversationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(IdempotencyService)
    private readonly idempotency: IdempotencyService,
  ) {}

  async create(
    ctx: BrokerContext,
    input: CreateConversationRequest,
    key: string,
  ): Promise<Conversation> {
    await this.assertLeadCurrentlyAuthorized(ctx, input.lead_id);
    const result = await this.idempotency.execute(
      ctx,
      "POST /api/conversations",
      key,
      input,
      async (tx) => {
        await this.assertLeadInScope(tx, ctx, input.lead_id);
        const [row] = await tx
          .insert(conversations)
          .values({
            workspaceId: ctx.workspace_id,
            brokerId: ctx.broker_id,
            leadId: input.lead_id,
            status: "open",
          })
          .returning();
        const body = toConversation({
          id: row.id,
          broker_id: row.brokerId,
          lead_id: row.leadId,
          status: row.status,
          last_message_at: row.lastMessageAt,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        });
        await this.audit.append(tx, {
          workspaceId: ctx.workspace_id,
          actorUserId: ctx.user_id,
          brokerId: ctx.broker_id,
          eventType: "conversation.created",
          resourceType: "conversation",
          resourceId: row.id,
          requestId: ctx.request_id,
          metadata: {
            conversation_id: row.id,
            lead_id: input.lead_id,
          },
        });
        return { status: 201, body };
      },
    );
    return result.body;
  }

  private async assertLeadCurrentlyAuthorized(
    ctx: BrokerContext,
    leadId: string,
  ): Promise<void> {
    await withWorkspaceContext(
      this.db,
      { workspaceId: ctx.workspace_id, brokerId: ctx.broker_id },
      async (tx) => {
        await this.assertLeadInScope(tx, ctx, leadId);
      },
    );
  }

  async list(
    ctx: BrokerContext,
    query: ConversationQuery,
  ): Promise<ConversationPage> {
    return withWorkspaceContext(
      this.db,
      { workspaceId: ctx.workspace_id, brokerId: ctx.broker_id },
      async (tx) => {
        const where = conversationWhere(ctx, query);
        const totalResult = await tx.execute(sql<{ total: string }>`
          SELECT count(*)::text AS total
          FROM conversations c
          JOIN leads l
            ON l.workspace_id = c.workspace_id
           AND l.broker_id = c.broker_id
           AND l.id = c.lead_id
          WHERE ${where}
        `);
        const rows = await tx.execute(sql<ConversationRow>`
          SELECT c.id, c.broker_id, c.lead_id, c.status, c.last_message_at,
            c.created_at, c.updated_at
          FROM conversations c
          JOIN leads l
            ON l.workspace_id = c.workspace_id
           AND l.broker_id = c.broker_id
           AND l.id = c.lead_id
          WHERE ${where}
          ORDER BY c.created_at ASC, c.id ASC
          LIMIT ${query.page_size}
          OFFSET ${(query.page - 1) * query.page_size}
        `);
        return {
          items: (rows.rows as unknown as ConversationRow[]).map(
            toConversation,
          ),
          page: {
            page: query.page,
            page_size: query.page_size,
            total: Number(totalResult.rows[0]?.total ?? 0),
          },
        };
      },
    );
  }

  async get(ctx: BrokerContext, id: string): Promise<Conversation> {
    return withWorkspaceContext(
      this.db,
      { workspaceId: ctx.workspace_id, brokerId: ctx.broker_id },
      async (tx) => this.getInTx(tx, ctx, id),
    );
  }

  async messages(
    ctx: BrokerContext,
    id: string,
    query: ConversationQuery,
  ): Promise<MessagePage> {
    return withWorkspaceContext(
      this.db,
      { workspaceId: ctx.workspace_id, brokerId: ctx.broker_id },
      async (tx) => {
        await this.getInTx(tx, ctx, id);
        const totalResult = await tx.execute(sql<{ total: string }>`
          SELECT count(*)::text AS total
          FROM messages
          WHERE workspace_id = ${ctx.workspace_id}
            AND broker_id = ${ctx.broker_id}
            AND conversation_id = ${id}
        `);
        const rows = await tx.execute(sql<MessageRow>`
          SELECT id, conversation_id, direction, author, status, content,
            occurred_at
          FROM messages
          WHERE workspace_id = ${ctx.workspace_id}
            AND broker_id = ${ctx.broker_id}
            AND conversation_id = ${id}
          ORDER BY occurred_at ASC, id ASC
          LIMIT ${query.page_size}
          OFFSET ${(query.page - 1) * query.page_size}
        `);
        return {
          items: (rows.rows as unknown as MessageRow[]).map(toMessage),
          page: {
            page: query.page,
            page_size: query.page_size,
            total: Number(totalResult.rows[0]?.total ?? 0),
          },
        };
      },
    );
  }

  private async getInTx(
    tx: Tx,
    ctx: BrokerContext,
    id: string,
  ): Promise<Conversation> {
    const result = await tx.execute(sql<ConversationRow>`
      SELECT id, broker_id, lead_id, status, last_message_at, created_at,
        updated_at
      FROM conversations
      WHERE workspace_id = ${ctx.workspace_id}
        AND broker_id = ${ctx.broker_id}
        AND id = ${id}
      LIMIT 1
    `);
    const row = result.rows[0] as unknown as ConversationRow | undefined;
    if (!row) throw problem(404, "RESOURCE_NOT_FOUND");
    return toConversation(row);
  }

  private async assertLeadInScope(
    tx: Tx,
    ctx: BrokerContext,
    leadId: string,
  ): Promise<void> {
    const result = await tx.execute(sql<{ id: string }>`
      SELECT id
      FROM leads
      WHERE workspace_id = ${ctx.workspace_id}
        AND broker_id = ${ctx.broker_id}
        AND id = ${leadId}
      LIMIT 1
    `);
    if (!result.rows[0]) throw problem(404, "RESOURCE_NOT_FOUND");
  }
}

function conversationWhere(ctx: BrokerContext, query: ConversationQuery) {
  const search = query.search?.trim();
  const pattern = search ? `%${escapeLike(search)}%` : undefined;
  return sql`
    c.workspace_id = ${ctx.workspace_id}
    AND c.broker_id = ${ctx.broker_id}
    ${
      pattern
        ? sql`AND (
            l.name ILIKE ${pattern} ESCAPE ${"\\"}
            OR coalesce(l.email::text, '') ILIKE ${pattern} ESCAPE ${"\\"}
            OR coalesce(l.phone_normalized, '') ILIKE ${pattern} ESCAPE ${"\\"}
            OR coalesce(l.interest, '') ILIKE ${pattern} ESCAPE ${"\\"}
          )`
        : sql``
    }
  `;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    broker_id: row.broker_id,
    lead_id: row.lead_id,
    status: row.status,
    last_message_at: row.last_message_at ? iso(row.last_message_at) : null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    direction: row.direction,
    author: row.author,
    status: row.status,
    content: row.content,
    occurred_at: iso(row.occurred_at),
  };
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
