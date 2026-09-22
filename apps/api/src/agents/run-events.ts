import { sql } from "drizzle-orm";
import type {
  AgentEvent,
  AgentRun,
  PersistedAgentEvent,
} from "@pacaembu/contracts";
import type { Tx } from "../db/client.js";
import type { RunContext } from "./hermes.port.js";

export const iso = (value: Date | string) => new Date(value).toISOString();
export interface RunRow {
  run_id: string;
  session_id: string;
  status: AgentRun["status"];
  input_content: string;
  result_json: AgentRun["result"];
  error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}
export function toRun(row: RunRow): AgentRun {
  return {
    run_id: row.run_id,
    session_id: row.session_id,
    status: row.status,
    input_content: row.input_content,
    result: row.result_json,
    error_code: row.error_code,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}
export function toPublicEvent(row: PersistedAgentEvent): AgentEvent {
  const { payload, ...rest } = row;
  return { ...rest, occurred_at: iso(row.occurred_at), data: payload };
}
// Database serialization is authoritative; provider sequence is never persisted.
export async function appendRunEvent(
  tx: Tx,
  ctx: RunContext,
  type: string,
  payload: Record<string, unknown>,
  now: Date,
): Promise<void> {
  await tx.execute(
    sql`SELECT run_id FROM agent_runs WHERE run_id=${ctx.run_id} FOR UPDATE`,
  );
  await tx.execute(sql`INSERT INTO agent_events(workspace_id,broker_id,session_id,run_id,sequence,type,payload,request_id,occurred_at)
    SELECT ${ctx.workspace_id},${ctx.broker_id},${ctx.agent_session_id},${ctx.run_id},coalesce(max(sequence),0)+1,${type},${JSON.stringify(payload)}::jsonb,${ctx.request_id},${now}
    FROM agent_events WHERE run_id=${ctx.run_id}`);
}
