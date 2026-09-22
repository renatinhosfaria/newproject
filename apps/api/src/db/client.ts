import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createPool(
  connectionString = process.env.DATABASE_URL,
): pg.Pool {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new pg.Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
  });
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema });
}

export async function withWorkspaceContext<T>(
  db: Db,
  context: { workspaceId: string; brokerId?: string },
  operation: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql.raw(
        `select set_config('app.workspace_id', ${quoteLiteral(context.workspaceId)}, true)`,
      ),
    );
    if (context.brokerId) {
      await tx.execute(
        sql.raw(
          `select set_config('app.broker_id', ${quoteLiteral(context.brokerId)}, true)`,
        ),
      );
    }
    return operation(tx);
  });
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
