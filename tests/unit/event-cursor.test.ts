import { describe, expect, it } from "vitest";
import { parseEventCursor, frameEvent } from "../../apps/api/src/agents/sse.js";
import { SseParser } from "../helpers/sse.js";
const runId = "00000000-0000-4000-8000-000000000001";
describe("SSE cursor and framing", () => {
  it("parses only a canonical UUID and a positive safe database sequence", () => {
    expect(parseEventCursor(`${runId}:42`)).toEqual({ runId, sequence: 42 });
    for (const value of [
      "",
      "other:1",
      `${runId}:0`,
      `${runId}:-1`,
      `${runId}:01`,
      `${runId}:1.5`,
      `${runId}:1e3`,
      `${runId}:2147483648`,
      `${runId}:1:2`,
      `${runId}: 1`,
      ` ${runId}:1`,
    ]) {
      expect(() => parseEventCursor(value)).toThrow();
    }
  });
  it("frames the public envelope without line injection and parses fragmented CRLF, comments and multiline data", () => {
    const event = {
      id: "event-1",
      run_id: runId,
      session_id: "session",
      workspace_id: "workspace",
      broker_id: "broker",
      sequence: 1,
      type: "agent.run.started",
      request_id: "request",
      occurred_at: "2026-01-01T00:00:00.000Z",
      data: { content: "olá\n\nevent: injected" },
    };
    const framed = frameEvent(event);
    expect(
      framed.startsWith(`id: ${runId}:1\nevent: agent.run.started\ndata: `),
    ).toBe(true);
    expect(framed.split("\n\n")).toHaveLength(2);
    const parser = new SseParser();
    const data = JSON.stringify(event).replace(
      ',"run_id"',
      ',\r\ndata: "run_id"',
    );
    const wire = `: heartbeat\r\n\r\nid: ${runId}:1\r\nevent: agent.run.started\r\ndata: ${data}\r\n\r\n`;
    const result = [...wire].flatMap((char) => parser.push(char));
    expect(result).toEqual([event]);
  });
});
