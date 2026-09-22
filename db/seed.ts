import argon2 from "argon2";
import pg from "pg";
import { sql } from "drizzle-orm";
import { migrate } from "./migrate.js";
import { createDb, type Db } from "../apps/api/src/db/client.js";

export interface DevCredentials {
  supervisorEmail: string;
  supervisorPassword: string;
  brokerEmail: string;
  brokerPassword: string;
}

const ids = {
  workspace: "00000000-0000-4000-8000-000000000101",
  supervisor: "00000000-0000-4000-8000-000000000102",
  supervisorMembership: "00000000-0000-4000-8000-000000000103",
  broker: "00000000-0000-4000-8000-000000000104",
  brokerMembership: "00000000-0000-4000-8000-000000000105",
  agent: "00000000-0000-4000-8000-000000000106",
};

export async function seed(db: Db, credentials: DevCredentials): Promise<void> {
  const environment = process.env.NODE_ENV ?? "development";
  if (environment !== "development" && environment !== "test") {
    throw new Error("development seed is restricted to development and test");
  }
  if (!credentials.supervisorPassword || !credentials.brokerPassword) {
    throw new Error("seed passwords must be provided through the environment");
  }
  const supervisorHash = await argon2.hash(credentials.supervisorPassword, {
    type: argon2.argon2id,
  });
  const brokerHash = await argon2.hash(credentials.brokerPassword, {
    type: argon2.argon2id,
  });
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`INSERT INTO workspaces (id, name, timezone, status) VALUES (${ids.workspace}, ${"Pacaembu local"}, ${"America/Sao_Paulo"}, ${"active"}::workspace_status) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    );
    await tx.execute(
      sql`INSERT INTO users (id, name, email, password_hash, status) VALUES (${ids.supervisor}, ${"Supervisor local"}, ${credentials.supervisorEmail.toLowerCase()}, ${supervisorHash}, ${"active"}::user_status) ON CONFLICT (email) DO NOTHING`,
    );
    await tx.execute(
      sql`INSERT INTO users (id, name, email, password_hash, status) VALUES (${ids.broker}, ${"Corretor local"}, ${credentials.brokerEmail.toLowerCase()}, ${brokerHash}, ${"active"}::user_status) ON CONFLICT (email) DO NOTHING`,
    );
    const supervisor = await tx.execute(
      sql`SELECT id FROM users WHERE email = ${credentials.supervisorEmail.toLowerCase()}`,
    );
    const broker = await tx.execute(
      sql`SELECT id FROM users WHERE email = ${credentials.brokerEmail.toLowerCase()}`,
    );
    const supervisorId = (
      supervisor as unknown as { rows: Array<{ id: string }> }
    ).rows[0].id;
    const brokerId = (broker as unknown as { rows: Array<{ id: string }> })
      .rows[0].id;
    await tx.execute(
      sql`INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES (${ids.supervisorMembership}, ${ids.workspace}, ${supervisorId}, ${"supervisor"}::membership_role, ${"active"}::user_status) ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
    );
    await tx.execute(
      sql`INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES (${ids.brokerMembership}, ${ids.workspace}, ${brokerId}, ${"broker"}::membership_role, ${"active"}::user_status) ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
    );
    await tx.execute(
      sql`INSERT INTO brokers (id, workspace_id, user_id, display_name, status) VALUES (${ids.broker}, ${ids.workspace}, ${brokerId}, ${"Corretor local"}, ${"active"}::broker_status) ON CONFLICT (workspace_id, user_id) DO UPDATE SET status = EXCLUDED.status`,
    );
    await tx.execute(
      sql`INSERT INTO agents (id, key, name, description, status) VALUES (${ids.agent}, ${"atendimento"}, ${"Atendimento"}, ${"Rascunhos de atendimento"}, ${"active"}::agent_status) ON CONFLICT (key) DO UPDATE SET status = EXCLUDED.status`,
    );
    for (const capability of [
      "crm.lead.read",
      "crm.conversation.read",
      "crm.message.draft",
    ]) {
      await tx.execute(
        sql`INSERT INTO agent_capabilities (agent_id, key) VALUES (${ids.agent}, ${capability}) ON CONFLICT (agent_id, key) DO NOTHING`,
      );
    }
    await tx.execute(
      sql`INSERT INTO workspace_agents (workspace_id, agent_id, enabled) VALUES (${ids.workspace}, ${ids.agent}, true) ON CONFLICT (workspace_id, agent_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
    );
  });
}

export async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await migrate(pool);
    await seed(createDb(pool), {
      supervisorEmail: process.env.SEED_SUPERVISOR_EMAIL ?? "",
      supervisorPassword: process.env.SEED_SUPERVISOR_PASSWORD ?? "",
      brokerEmail: process.env.SEED_BROKER_EMAIL ?? "",
      brokerPassword: process.env.SEED_BROKER_PASSWORD ?? "",
    });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
