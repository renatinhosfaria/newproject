import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version varchar(255) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = [
    "0001_identity.sql",
    "0002_crm.sql",
    "0003_agents.sql",
    "0004_reliability.sql",
    "0005_agent_session_hardening.sql",
    "0006_auth_broker_lookup.sql",
    "0007_harden_auth_lookup.sql",
  ];
  for (const file of files) {
    const version = file.slice(0, 4);
    const exists = await pool.query(
      "SELECT 1 FROM schema_migrations WHERE version = $1",
      [version],
    );
    if (exists.rowCount) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext('pacaembu:migrations'))",
      );
      const check = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [version],
      );
      if (!check.rowCount) {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(version) VALUES ($1)",
          [version],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
