import { problem } from "../http/problem.filter.js";
import type {
  AdapterEvent,
  AgentInput,
  HermesPort,
  RunContext,
} from "./hermes.port.js";
import type { Tools } from "./tools.js";

// Purely local simulation: the input is recorded by the API, never interpreted as
// authority or as a scenario selector. Run identifiers always come from the API.
export class MockHermesAdapter implements HermesPort {
  private readonly runs = new Map<string, RunContext>();
  constructor(private readonly tools: Tools) {}
  async startAgentRun(
    context: RunContext,
    _input: AgentInput,
  ): Promise<{ status: "running" }> {
    this.runs.set(context.run_id, structuredClone(context));
    return { status: "running" };
  }
  async *streamAgentEvents(
    runId: string,
    afterSequence: number,
  ): AsyncIterable<AdapterEvent> {
    const ctx = this.runs.get(runId);
    if (!ctx) throw problem(404, "RUN_NOT_FOUND");
    let sequence = 0;
    const event = (data: Omit<AdapterEvent, "sequence">) =>
      ({ ...data, sequence: ++sequence }) as AdapterEvent;
    const visible = (e: AdapterEvent) =>
      e.sequence > afterSequence && this.runs.has(runId);
    try {
      const started = event({ type: "agent.run.started" });
      if (visible(started)) yield started;
      if (!this.runs.has(runId)) return;
      if (ctx.lead_id) {
        await this.tools.readLead(ctx, ctx.lead_id);
        const e = {
          sequence: ++sequence,
          type: "agent.tool.called",
          tool: "crm.lead.read",
        } as const;
        if (visible(e)) yield e;
      }
      if (!this.runs.has(runId)) return;
      if (ctx.conversation_id) {
        await this.tools.readConversation(ctx, ctx.conversation_id);
        const e = {
          sequence: ++sequence,
          type: "agent.tool.called",
          tool: "crm.conversation.read",
        } as const;
        if (visible(e)) yield e;
      }
      if (!this.runs.has(runId)) return;
      const content = ctx.conversation_id
        ? "[Atendimento simulado] Olá! Posso ajudar a esclarecer suas dúvidas sobre o imóvel nesta conversa?"
        : "[Atendimento simulado] Olá! Posso ajudar a esclarecer suas dúvidas sobre o imóvel?";
      const result = await this.tools.validateDraft(ctx, content);
      const called = {
        sequence: ++sequence,
        type: "agent.tool.called",
        tool: "crm.message.draft",
      } as const;
      if (visible(called)) yield called;
      const output = {
        sequence: ++sequence,
        type: "agent.output.created",
        result,
      } as const;
      if (visible(output)) yield output;
      const completed = event({ type: "agent.run.completed" });
      if (visible(completed)) yield completed;
    } finally {
      this.runs.delete(runId);
    }
  }
  async stopAgentRun(runId: string): Promise<"cancelled"> {
    this.runs.delete(runId);
    return "cancelled";
  }
}
