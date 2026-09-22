import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type {
  BrokerContext,
  CreateLeadRequest,
  Lead,
  LeadPage,
  LeadStage,
  UpdateLeadRequest,
} from "@pacaembu/contracts";
import { AuditService } from "../audit/audit.service.js";
import { DB } from "../auth/auth.service.js";
import { type Db, type Tx, withWorkspaceContext } from "../db/client.js";
import { leads } from "../db/schema.js";
import { problem } from "../http/problem.filter.js";

export interface LeadQuery {
  page: number;
  page_size: number;
  search?: string;
  stage?: LeadStage;
}

interface LeadRow {
  id: string;
  broker_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  interest: string | null;
  next_action: string | null;
  stage: LeadStage;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class LeadsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(ctx: BrokerContext, input: CreateLeadRequest): Promise<Lead> {
    return withWorkspaceContext(
      this.db,
      { workspaceId: ctx.workspace_id, brokerId: ctx.broker_id },
      async (tx) => {
        const [row] = await tx
          .insert(leads)
          .values({
            workspaceId: ctx.workspace_id,
            brokerId: ctx.broker_id,
            name: input.name,
            phoneNormalized: normalizePhone(input.phone),
            email: input.email ?? null,
            source: input.source ?? null,
            interest: input.interest ?? null,
            stage: "novo",
          })
          .returning();
        await this.audit.append(tx, {
          workspaceId: ctx.workspace_id,
          actorUserId: ctx.user_id,
          brokerId: ctx.broker_id,
          eventType: "lead.created",
          resourceType: "lead",
          resourceId: row.id,
          requestId: ctx.request_id,
          metadata: { lead_id: row.id },
        });
        return toLead({
          id: row.id,
          broker_id: row.brokerId,
          name: row.name,
          phone: row.phoneNormalized,
          email: row.email,
          source: row.source,
          interest: row.interest,
          next_action: row.nextAction,
          stage: row.stage,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        });
      },
    );
  }

  async list(ctx: BrokerContext, query: LeadQuery): Promise<LeadPage> {
    return withWorkspaceContext(
      this.db,
      { workspaceId: ctx.workspace_id, brokerId: ctx.broker_id },
      async (tx) => {
        const where = leadWhere(ctx, query);
        const totalResult = await tx.execute(sql<{ total: string }>`
          SELECT count(*)::text AS total
          FROM leads
          WHERE ${where}
        `);
        const rows = await tx.execute(sql<LeadRow>`
          SELECT id, broker_id, name, phone_normalized AS phone, email, source,
            interest, next_action, stage, created_at, updated_at
          FROM leads
          WHERE ${where}
          ORDER BY created_at ASC, id ASC
          LIMIT ${query.page_size}
          OFFSET ${(query.page - 1) * query.page_size}
        `);
        return {
          items: (rows.rows as unknown as LeadRow[]).map(toLead),
          page: {
            page: query.page,
            page_size: query.page_size,
            total: Number(totalResult.rows[0]?.total ?? 0),
          },
        };
      },
    );
  }

  async get(ctx: BrokerContext, id: string): Promise<Lead> {
    return withWorkspaceContext(
      this.db,
      { workspaceId: ctx.workspace_id, brokerId: ctx.broker_id },
      async (tx) => this.getInTx(tx, ctx, id),
    );
  }

  async update(
    ctx: BrokerContext,
    id: string,
    input: UpdateLeadRequest,
  ): Promise<Lead> {
    return withWorkspaceContext(
      this.db,
      { workspaceId: ctx.workspace_id, brokerId: ctx.broker_id },
      async (tx) => {
        const changes: Partial<typeof leads.$inferInsert> = {
          updatedAt: new Date(),
        };
        const fields: string[] = [];
        if (input.name !== undefined) {
          changes.name = input.name;
          fields.push("name");
        }
        if (input.phone !== undefined) {
          changes.phoneNormalized = normalizePhone(input.phone);
          fields.push("phone");
        }
        if (input.email !== undefined) {
          changes.email = input.email;
          fields.push("email");
        }
        if (input.stage !== undefined) {
          changes.stage = input.stage;
          fields.push("stage");
        }
        if (input.interest !== undefined) {
          changes.interest = input.interest;
          fields.push("interest");
        }
        if (input.next_action !== undefined) {
          changes.nextAction = input.next_action;
          fields.push("next_action");
        }
        const [row] = await tx
          .update(leads)
          .set(changes)
          .where(
            and(
              eq(leads.workspaceId, ctx.workspace_id),
              eq(leads.brokerId, ctx.broker_id),
              eq(leads.id, id),
            ),
          )
          .returning();
        if (!row) throw problem(404, "RESOURCE_NOT_FOUND");
        await this.audit.append(tx, {
          workspaceId: ctx.workspace_id,
          actorUserId: ctx.user_id,
          brokerId: ctx.broker_id,
          eventType: "lead.updated",
          resourceType: "lead",
          resourceId: row.id,
          requestId: ctx.request_id,
          metadata: { lead_id: row.id, fields: fields.join(",") },
        });
        return toLead({
          id: row.id,
          broker_id: row.brokerId,
          name: row.name,
          phone: row.phoneNormalized,
          email: row.email,
          source: row.source,
          interest: row.interest,
          next_action: row.nextAction,
          stage: row.stage,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        });
      },
    );
  }

  async getInTx(tx: Tx, ctx: BrokerContext, id: string): Promise<Lead> {
    const result = await tx.execute(sql<LeadRow>`
      SELECT id, broker_id, name, phone_normalized AS phone, email, source,
        interest, next_action, stage, created_at, updated_at
      FROM leads
      WHERE workspace_id = ${ctx.workspace_id}
        AND broker_id = ${ctx.broker_id}
        AND id = ${id}
      LIMIT 1
    `);
    const row = result.rows[0] as unknown as LeadRow | undefined;
    if (!row) throw problem(404, "RESOURCE_NOT_FOUND");
    return toLead(row);
  }
}

function leadWhere(ctx: BrokerContext, query: LeadQuery) {
  const search = query.search?.trim();
  const pattern = search ? `%${escapeLike(search)}%` : undefined;
  return sql`
    workspace_id = ${ctx.workspace_id}
    AND broker_id = ${ctx.broker_id}
    ${query.stage ? sql`AND stage = ${query.stage}` : sql``}
    ${
      pattern
        ? sql`AND (
            name ILIKE ${pattern} ESCAPE ${"\\"}
            OR coalesce(email::text, '') ILIKE ${pattern} ESCAPE ${"\\"}
            OR coalesce(phone_normalized, '') ILIKE ${pattern} ESCAPE ${"\\"}
            OR coalesce(interest, '') ILIKE ${pattern} ESCAPE ${"\\"}
          )`
        : sql``
    }
  `;
}

function normalizePhone(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const parsed = parsePhoneNumberFromString(value, "BR");
  if (!parsed?.isValid()) throw problem(422, "VALIDATION_ERROR");
  return parsed.number;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    broker_id: row.broker_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    source: row.source,
    interest: row.interest,
    next_action: row.next_action,
    stage: row.stage,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

function iso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
