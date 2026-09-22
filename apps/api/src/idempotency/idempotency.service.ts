import type { BrokerContext } from "@pacaembu/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Clock } from "../clock.js";
import type { Db, Tx } from "../db/client.js";
import { DB } from "../auth/auth.service.js";
import { problem } from "../http/problem.filter.js";
import { CLOCK } from "../http/health.controller.js";
import { canonicalJson, sha256Hex } from "./canonical-json.js";

export interface IdempotentResponse<T> {
  status: number;
  body: T;
}

interface StoredRecord {
  request_hash: string;
  response_status: number;
  response_body: unknown;
}

@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute<T>(
    scope: BrokerContext,
    operation: string,
    key: string,
    input: unknown,
    perform: (tx: Tx) => Promise<IdempotentResponse<T>>,
  ): Promise<IdempotentResponse<T>> {
    const requestHash = sha256Hex(canonicalJson({ operation, body: input }));
    return this.db.transaction(async (tx) => {
      await this.setLocalContext(tx, scope);
      await this.assertActiveBrokerContext(tx, scope);
      await this.lockIdentity(tx, scope, operation, key);
      await tx.execute(sql`
        DELETE FROM idempotency_records
        WHERE workspace_id = ${scope.workspace_id}
          AND user_id = ${scope.user_id}
          AND operation = ${operation}
          AND key = ${key}
          AND expires_at < ${this.clock.now()}
      `);
      const existing = await tx.execute(sql<StoredRecord>`
        SELECT request_hash, response_status, response_body
        FROM idempotency_records
        WHERE workspace_id = ${scope.workspace_id}
          AND user_id = ${scope.user_id}
          AND operation = ${operation}
          AND key = ${key}
      `);
      const row = existing.rows[0] as unknown as StoredRecord | undefined;
      if (row) {
        if (row.request_hash !== requestHash)
          throw problem(409, "IDEMPOTENCY_KEY_REUSED");
        return {
          status: row.response_status,
          body: row.response_body as T,
        };
      }

      const response = await perform(tx);
      await tx.execute(sql`
        INSERT INTO idempotency_records (
          workspace_id,
          user_id,
          broker_id,
          operation,
          resource_type,
          key,
          request_hash,
          response_status,
          response_body,
          expires_at
        )
        VALUES (
          ${scope.workspace_id},
          ${scope.user_id},
          ${scope.broker_id},
          ${operation},
          ${resourceTypeFromOperation(operation)},
          ${key},
          ${requestHash},
          ${response.status},
          ${response.body as Record<string, unknown>},
          ${new Date(this.clock.now().getTime() + 24 * 60 * 60 * 1000)}
        )
      `);
      return response;
    });
  }

  private async setLocalContext(tx: Tx, scope: BrokerContext): Promise<void> {
    await tx.execute(
      sql`select set_config('app.workspace_id', ${scope.workspace_id}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.broker_id', ${scope.broker_id}, true)`,
    );
    await tx.execute(
      sql`select set_config('app.user_id', ${scope.user_id}, true)`,
    );
  }

  private async assertActiveBrokerContext(
    tx: Tx,
    scope: BrokerContext,
  ): Promise<void> {
    const result = await tx.execute(sql<{
      user_status: string;
      workspace_status: string;
      membership_status: string;
      broker_status: string;
    }>`
      SELECT
        u.status AS user_status,
        w.status AS workspace_status,
        wm.status AS membership_status,
        b.status AS broker_status
      FROM users u
      JOIN workspaces w ON w.id = ${scope.workspace_id}
      JOIN workspace_memberships wm
        ON wm.id = ${scope.membership_id}
       AND wm.user_id = u.id
       AND wm.workspace_id = w.id
       AND wm.role = 'broker'
      JOIN brokers b
        ON b.id = ${scope.broker_id}
       AND b.workspace_id = w.id
       AND b.user_id = u.id
      WHERE u.id = ${scope.user_id}
    `);
    const row = result.rows[0];
    if (!row) throw problem(403, "BROKER_CONTEXT_INVALID");
    if (row.workspace_status !== "active")
      throw problem(403, "WORKSPACE_SUSPENDED");
    if (row.user_status !== "active") throw problem(403, "USER_SUSPENDED");
    if (row.membership_status !== "active")
      throw problem(403, "MEMBERSHIP_SUSPENDED");
    if (row.broker_status !== "active") throw problem(403, "BROKER_SUSPENDED");
  }

  private async lockIdentity(
    tx: Tx,
    scope: BrokerContext,
    operation: string,
    key: string,
  ): Promise<void> {
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtextextended(
          ${`${scope.workspace_id}:${scope.user_id}:${operation}:${key}`},
          0
        )
      )
    `);
  }
}

function resourceTypeFromOperation(operation: string): string {
  const match = operation.match(/^POST \/api\/([^/]+)/);
  return match?.[1] ?? "operation";
}
