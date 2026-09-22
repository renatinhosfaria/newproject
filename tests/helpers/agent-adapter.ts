import type {
  HermesPort,
  AdapterEvent,
  RunContext,
  AgentInput,
} from "../../apps/api/src/agents/hermes.port.js";
import { MockHermesAdapter } from "../../apps/api/src/agents/mock-hermes.adapter.js";
import type { Tools } from "../../apps/api/src/agents/tools.js";
import { problem } from "../../apps/api/src/http/problem.filter.js";
export type MockScenario =
  "unavailable" | "hold" | "partial" | "fail-after-output";
export function controlledAdapter(
  tools: Tools,
  scenario: MockScenario | undefined,
  onRelease: (release: () => void) => void,
): HermesPort {
  const real = new MockHermesAdapter(tools);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  onRelease(release);
  return {
    async startAgentRun(ctx: RunContext, input: AgentInput) {
      if (scenario === "unavailable")
        throw problem(503, "HERMES_PROFILE_UNAVAILABLE");
      return real.startAgentRun(ctx, input);
    },
    async *streamAgentEvents(
      runId: string,
      after: number,
    ): AsyncIterable<AdapterEvent> {
      for await (const event of real.streamAgentEvents(runId, after)) {
        if (event.type === "agent.output.created" && scenario === "hold")
          await gate;
        if (event.type === "agent.run.completed" && scenario === "partial")
          return;
        if (
          event.type === "agent.run.completed" &&
          scenario === "fail-after-output"
        )
          throw new Error("synthetic private provider details");
        yield event;
      }
    },
    async stopAgentRun(runId: string) {
      release();
      return real.stopAgentRun(runId);
    },
  };
}
