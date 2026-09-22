import type { AgentResult, BrokerContext } from "@pacaembu/contracts";
export const CAPABILITIES = [
  "crm.lead.read",
  "crm.conversation.read",
  "crm.message.draft",
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type RunContext = BrokerContext & {
  run_id: string;
  agent_id: string;
  agent_session_id: string;
  lead_id?: string;
  conversation_id?: string;
  permissions: Capability[];
};
export type AgentInput = { content: string };
export type AdapterEvent =
  | { sequence: number; type: "agent.run.started" }
  | { sequence: number; type: "agent.tool.called"; tool: Capability }
  | { sequence: number; type: "agent.output.created"; result: AgentResult }
  | { sequence: number; type: "agent.run.completed" }
  | { sequence: number; type: "agent.run.failed"; code: string };
export interface HermesPort {
  startAgentRun(
    context: RunContext,
    input: AgentInput,
  ): Promise<{ status: "running" }>;
  streamAgentEvents(
    runId: string,
    afterSequence: number,
  ): AsyncIterable<AdapterEvent>;
  stopAgentRun(runId: string): Promise<"cancelled">;
}
export const HERMES = Symbol("HERMES");
export const EXECUTOR_ENABLED = Symbol("EXECUTOR_ENABLED");
