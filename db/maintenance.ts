import pg from "pg";

export async function maintenance(
  pool: pg.Pool,
  now = new Date(),
): Promise<void> {
  await pool.query(
    "DELETE FROM auth_sessions WHERE expires_at < $1 OR revoked_at < $1",
    [now],
  );
  await pool.query("DELETE FROM idempotency_records WHERE expires_at < $1", [
    now,
  ]);
  await pool.query("DELETE FROM agent_events WHERE occurred_at < $1", [
    new Date(now.getTime() - 7 * 86400000),
  ]);
}

export async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await maintenance(pool);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
