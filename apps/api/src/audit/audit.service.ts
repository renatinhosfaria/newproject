import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Tx } from "../db/client.js";

export interface AuditInput {
  workspaceId: string;
  actorUserId: string;
  brokerId?: string | null;
  eventType: string;
  resourceType: string;
  resourceId?: string | null;
  requestId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

// Authentication is the only audit producer in this cycle. Keep its public
// metadata deliberately small so credentials, cookies and arbitrary request
// data can never be persisted through this boundary.
const SAFE_METADATA_KEYS = new Set([
  "method",
  "code",
  "count",
  "lead_id",
  "conversation_id",
  "fields",
]);

@Injectable()
export class AuditService {
  async append(tx: Tx, event: AuditInput): Promise<void> {
    const metadata = Object.fromEntries(
      Object.entries(event.metadata ?? {}).filter(([key]) =>
        SAFE_METADATA_KEYS.has(key),
      ),
    );
    await tx.execute(sql`
      INSERT INTO audit_events (workspace_id, actor_user_id, broker_id, event_type, resource_type, resource_id, request_id, metadata_json)
      VALUES (${event.workspaceId}, ${event.actorUserId}, ${event.brokerId ?? null}, ${event.eventType}, ${event.resourceType}, ${event.resourceId ?? null}, ${event.requestId}, ${JSON.stringify(metadata)}::jsonb)
    `);
  }
}
