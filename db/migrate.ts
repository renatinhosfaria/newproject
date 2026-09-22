import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export async function migrate(
  pool: pg.Pool,
  schemaName?: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    schemaName ??= (await client.query("SELECT current_schema() AS name"))
      .rows[0].name;
    if (!schemaName || !/^[a-z_][a-z0-9_]*$/.test(schemaName))
      throw new Error("Invalid migration schema");
    // Extensions are database-wide; only their installation needs a global lock.
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('pacaembu:extensions'))",
    );
    await client.query(
      "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public",
    );
    await client.query(
      "CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public",
    );
    await client.query("COMMIT");
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `pacaembu:migrations:${schemaName}`,
    ]);
    await client.query(`SET LOCAL search_path = "${schemaName}", pg_temp`);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version varchar(255) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const file of [
      "0001_identity.sql",
      "0002_crm.sql",
      "0003_agents.sql",
      "0004_reliability.sql",
      "0005_agent_session_hardening.sql",
      "0006_auth_broker_lookup.sql",
      "0007_harden_auth_lookup.sql",
      "0008_schema_scoped_auth.sql",
      "0009_idempotency_rls.sql",
      "0010_leads_update.sql",
      "0011_durable_agent_runs.sql",
    ]) {
      const version = file.slice(0, 4);
      const check = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version],
      );
      if (!check.rowCount) {
        await client.query(await readFile(join(migrationsDir, file), "utf8"));
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES ($1)",
          [version],
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString });
  try {
    await migrate(pool);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
