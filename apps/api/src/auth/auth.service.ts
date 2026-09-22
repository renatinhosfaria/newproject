import { Inject, Injectable } from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { LoginRequest, SessionUser } from "@pacaembu/contracts";
import type { Clock } from "../clock.js";
import { type Db, type Tx } from "../db/client.js";
import { problem } from "../http/problem.filter.js";
import { verifyPassword } from "./passwords.js";
import { AuditService } from "../audit/audit.service.js";

export const DB = Symbol("DB");

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  user_status: string;
}
interface MembershipRow {
  membership_id: string;
  workspace_id: string;
  role: "broker" | "supervisor";
  membership_status: string;
  workspace_status: string;
  broker_id: string | null;
  broker_status: string | null;
}

@Injectable()
export class AuthService {
  private readonly ttlMs = 8 * 60 * 60 * 1000;
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly clock: Clock,
    private readonly audit: AuditService,
  ) {}

  async login(
    input: LoginRequest,
    requestId = "unknown",
    txOverride?: Tx,
  ): Promise<{ token: string; user: SessionUser }> {
    const email = input.email.trim().toLowerCase();
    const rows = await this.db.execute(sql`
      SELECT id, name, email, password_hash, status AS user_status
      FROM users WHERE email = ${email} LIMIT 1
    `);
    const user = (rows as unknown as { rows: UserRow[] }).rows[0];
    const passwordValid = user
      ? await verifyPassword(user.password_hash, input.password)
      : false;
    if (!user || !passwordValid) {
      if (user)
        await this.auditLoginFailure(user.id, requestId, "INVALID_CREDENTIALS");
      throw problem(401, "INVALID_CREDENTIALS");
    }
    if (user.user_status !== "active")
      throw problem(401, "INVALID_CREDENTIALS");

    const membershipsResult = await this.db.execute(sql`
      SELECT wm.id AS membership_id, wm.workspace_id, wm.role,
        wm.status AS membership_status, w.status AS workspace_status,
        b.id AS broker_id, b.status AS broker_status
      FROM workspace_memberships wm
      JOIN workspaces w ON w.id = wm.workspace_id
      LEFT JOIN LATERAL auth_broker_for_user(wm.user_id, wm.workspace_id) b ON true
      WHERE wm.user_id = ${user.id} AND wm.status = 'active' AND w.status = 'active'
      ORDER BY wm.workspace_id
    `);
    const memberships = (
      membershipsResult as unknown as { rows: MembershipRow[] }
    ).rows;
    if (memberships.length === 0) throw problem(403, "NO_ACTIVE_MEMBERSHIP");
    let membership: MembershipRow | undefined;
    if (input.workspace_id) {
      membership = memberships.find(
        (candidate) => candidate.workspace_id === input.workspace_id,
      );
      if (!membership) throw problem(403, "WORKSPACE_ACCESS_DENIED");
    } else if (memberships.length === 1) {
      membership = memberships[0];
    } else {
      const error = problem(409, "WORKSPACE_CONTEXT_REQUIRED");
      error.options = memberships.map(({ workspace_id }) => ({ workspace_id }));
      throw error;
    }
    if (
      membership.role === "broker" &&
      (!membership.broker_id || membership.broker_status !== "active")
    ) {
      throw problem(403, "BROKER_CONTEXT_REQUIRED");
    }
    const sessionUser = this.toSessionUser(user, membership);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const insert = async (tx: Tx) => {
      await setAuditContext(
        tx,
        membership!.workspace_id,
        membership!.broker_id,
      );
      await tx.execute(sql`
        INSERT INTO auth_sessions (user_id, workspace_id, membership_id, token_hash, expires_at, last_seen_at)
        VALUES (${user.id}, ${membership!.workspace_id}, ${membership!.membership_id}, ${tokenHash}, ${expiresAt}, ${now})
      `);
      await this.audit.append(tx, {
        workspaceId: membership!.workspace_id,
        actorUserId: user.id,
        brokerId: membership!.broker_id,
        eventType: "auth.login.succeeded",
        resourceType: "auth_session",
        requestId,
        metadata: { method: "password" },
      });
    };
    if (txOverride) await insert(txOverride);
    else await this.db.transaction(insert);
    return { token, user: sessionUser };
  }

  async resolveSession(token: string): Promise<SessionUser> {
    if (!token) throw problem(401, "SESSION_REQUIRED");
    const tokenHash = hashToken(token);
    const result = await this.db.execute(sql`
      SELECT s.user_id, s.workspace_id, s.membership_id, s.expires_at, s.revoked_at,
        u.id, u.name, u.email, u.status AS user_status,
        wm.role, wm.status AS membership_status, w.status AS workspace_status,
        b.id AS broker_id, b.status AS broker_status
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      JOIN workspace_memberships wm ON wm.id = s.membership_id AND wm.workspace_id = s.workspace_id AND wm.user_id = s.user_id
      JOIN workspaces w ON w.id = s.workspace_id
      LEFT JOIN LATERAL auth_broker_for_user(s.user_id, s.workspace_id) b ON true
      WHERE s.token_hash = ${tokenHash}
      LIMIT 1
    `);
    const row = (result as unknown as { rows: Array<Record<string, any>> })
      .rows[0];
    const now = this.clock.now();
    if (
      !row ||
      row.revoked_at ||
      new Date(row.expires_at).getTime() <= now.getTime() ||
      row.user_status !== "active" ||
      row.membership_status !== "active" ||
      row.workspace_status !== "active" ||
      (row.role === "broker" &&
        (row.broker_status !== "active" || !row.broker_id))
    ) {
      throw problem(401, "SESSION_INVALID");
    }
    await this.db.execute(
      sql`UPDATE auth_sessions SET last_seen_at = ${now} WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`,
    );
    return {
      id: row.user_id,
      membership_id: row.membership_id,
      name: row.name,
      email: row.email,
      role: row.role,
      workspace_id: row.workspace_id,
      broker_id: row.role === "broker" ? row.broker_id : null,
    };
  }

  async logout(token: string, requestId = "unknown"): Promise<void> {
    if (!token) throw problem(401, "SESSION_REQUIRED");
    const tokenHash = hashToken(token);
    await this.db.transaction(async (tx) => {
      const result = await tx.execute(sql`
        UPDATE auth_sessions SET revoked_at = ${this.clock.now()}
        WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
        RETURNING user_id, workspace_id, membership_id
      `);
      const row = (
        result as unknown as {
          rows: Array<{
            user_id: string;
            workspace_id: string;
            membership_id: string;
          }>;
        }
      ).rows[0];
      if (!row) throw problem(401, "SESSION_INVALID");
      await setAuditContext(tx, row.workspace_id, null);
      await this.audit.append(tx, {
        workspaceId: row.workspace_id,
        actorUserId: row.user_id,
        eventType: "auth.logout",
        resourceType: "auth_session",
        requestId,
        metadata: {},
      });
    });
  }

  private toSessionUser(user: UserRow, membership: MembershipRow): SessionUser {
    return {
      id: user.id,
      membership_id: membership.membership_id,
      name: user.name,
      email: user.email,
      role: membership.role,
      workspace_id: membership.workspace_id,
      broker_id: membership.role === "broker" ? membership.broker_id : null,
    };
  }

  private async auditLoginFailure(
    userId: string,
    requestId: string,
    code: string,
  ): Promise<void> {
    try {
      const result = await this.db.execute(sql`
        SELECT wm.workspace_id, wm.role, b.id AS broker_id
        FROM workspace_memberships wm
        LEFT JOIN LATERAL auth_broker_for_user(wm.user_id, wm.workspace_id) b ON true
        WHERE wm.user_id = ${userId}
        ORDER BY wm.workspace_id
        LIMIT 1
      `);
      const context = (
        result as unknown as {
          rows: Array<{
            workspace_id: string;
            role: "broker" | "supervisor";
            broker_id: string | null;
          }>;
        }
      ).rows[0];
      if (!context) return;
      await this.db.transaction(async (tx) => {
        const brokerId = context.role === "broker" ? context.broker_id : null;
        await setAuditContext(tx, context.workspace_id, brokerId);
        await this.audit.append(tx, {
          workspaceId: context.workspace_id,
          actorUserId: userId,
          brokerId,
          eventType: "auth.login.failed",
          resourceType: "auth_session",
          requestId,
          metadata: { code, count: 1 },
        });
      });
    } catch {
      // Keep the public authentication failure uniform if audit storage fails.
    }
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function setAuditContext(
  tx: Tx,
  workspaceId: string,
  brokerId: string | null,
): Promise<void> {
  await tx.execute(
    sql`SELECT set_config('app.workspace_id', ${workspaceId}, true)`,
  );
  await tx.execute(
    sql`SELECT set_config('app.broker_id', ${brokerId ?? ""}, true)`,
  );
}
