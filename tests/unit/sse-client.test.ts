import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@pacaembu/contracts";
import {
  SseHttpError,
  createSseParser,
  subscribeRun,
} from "../../apps/web/src/lib/sse-client.js";

const SESSION = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";

function event(sequence: number, type: string, data = {}): AgentEvent {
  return {
    id: `33333333-3333-4333-8333-${String(sequence).padStart(12, "0")}`,
    run_id: RUN,
    session_id: SESSION,
    workspace_id: "w",
    broker_id: "b",
    sequence,
    type,
    request_id: "r",
    occurred_at: "2026-01-01T00:00:00.000Z",
    data,
  };
}

function frame(e: AgentEvent): string {
  return `id: ${e.run_id}:${e.sequence}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

function streamResponse(chunks: Array<string | Uint8Array>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(
          typeof chunk === "string" ? encoder.encode(chunk) : chunk,
        );
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function problem(status: number, code: string, retryable = false): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title: code,
      status,
      code,
      request_id: "r",
      retryable,
    }),
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

interface Call {
  url: string;
  headers: Headers;
  signal?: AbortSignal | null;
}

function fakeFetch(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      signal: init?.signal,
    });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  };
  return { calls, fetch: impl as typeof fetch };
}

function recorder() {
  const sleeps: number[] = [];
  return {
    sleeps,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
}

describe("SSE parser", () => {
  it("reads fragmented frames, CRLF, comments and split UTF-8 sequences", () => {
    const parser = createSseParser();
    const text = frame(
      event(1, "agent.output.created", { result: { content: "Olá, ação" } }),
    ).replaceAll("\n", "\r\n");
    const bytes = new TextEncoder().encode(`: heartbeat\r\n\r\n${text}`);
    const split = bytes.indexOf(0xc3) + 1; // inside the two-byte "á"
    const events = [
      ...parser.push(bytes.slice(0, 5)),
      ...parser.push(bytes.slice(5, split)),
      ...parser.push(bytes.slice(split)),
    ];
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ result: { content: "Olá, ação" } });
    expect(events[0].sequence).toBe(1);
  });

  it("joins multi-line data fields", () => {
    const parser = createSseParser();
    const json = JSON.stringify(event(2, "agent.run.started"), null, 1);
    const data = json
      .split("\n")
      .map((line) => `data: ${line}`)
      .join("\n");
    expect(parser.push(new TextEncoder().encode(`${data}\n\n`))).toHaveLength(
      1,
    );
  });
});

describe("subscribeRun", () => {
  it("reconnects with Last-Event-ID and applies each event once", async () => {
    const { calls, fetch } = fakeFetch([
      streamResponse([
        frame(event(1, "agent.run.started")),
        frame(event(2, "agent.tool.called")),
      ]),
      streamResponse([
        frame(event(2, "agent.tool.called")),
        frame(event(3, "agent.run.completed")),
        frame(event(4, "agent.run.completed")),
      ]),
    ]);
    const seen: number[] = [];
    const { sleeps, sleep } = recorder();
    await subscribeRun({
      sessionId: SESSION,
      runId: RUN,
      onEvent: (e) => seen.push(e.sequence),
      onExpired: () => {
        throw new Error("unexpected");
      },
      onUnauthorized: () => {
        throw new Error("unexpected");
      },
      signal: new AbortController().signal,
      fetch,
      sleep,
    });
    expect(seen).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(
      `/api/agent-sessions/${SESSION}/events?run_id=${RUN}`,
    );
    expect(calls[0].headers.get("last-event-id")).toBeNull();
    expect(calls[1].headers.get("last-event-id")).toBe(`${RUN}:2`);
    expect(sleeps).toEqual([1000]);
  });

  it("starts after the provided cursor", async () => {
    const { calls, fetch } = fakeFetch([
      streamResponse([frame(event(5, "agent.run.failed"))]),
    ]);
    const seen: number[] = [];
    await subscribeRun({
      sessionId: SESSION,
      runId: RUN,
      lastEventId: `${RUN}:4`,
      onEvent: (e) => seen.push(e.sequence),
      onExpired: () => {},
      signal: new AbortController().signal,
      fetch,
      sleep: recorder().sleep,
    });
    expect(calls[0].headers.get("last-event-id")).toBe(`${RUN}:4`);
    expect(seen).toEqual([5]);
  });

  it("backs off 1/2/4/8 seconds capped at 10 on network failures", async () => {
    const failures = Array.from(
      { length: 6 },
      () => new TypeError("network down"),
    );
    const { fetch } = fakeFetch([
      ...failures,
      streamResponse([frame(event(1, "agent.run.completed"))]),
    ]);
    const { sleeps, sleep } = recorder();
    await subscribeRun({
      sessionId: SESSION,
      runId: RUN,
      onEvent: () => {},
      onExpired: () => {},
      signal: new AbortController().signal,
      fetch,
      sleep,
    });
    expect(sleeps).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
  });

  it("retries a retryable 503 but not ordinary HTTP errors", async () => {
    const retryable = problem(503, "SERVER_SHUTTING_DOWN", true);
    const { fetch } = fakeFetch([
      retryable,
      streamResponse([frame(event(1, "agent.run.completed"))]),
    ]);
    const { sleeps, sleep } = recorder();
    await subscribeRun({
      sessionId: SESSION,
      runId: RUN,
      onEvent: () => {},
      onExpired: () => {},
      signal: new AbortController().signal,
      fetch,
      sleep,
    });
    expect(sleeps).toEqual([1000]);

    for (const [status, code] of [
      [404, "RESOURCE_NOT_FOUND"],
      [422, "INVALID_EVENT_CURSOR"],
      [503, "UNEXPECTED_UNAVAILABLE"],
    ] as const) {
      const failing = fakeFetch([problem(status, code)]);
      const error = await subscribeRun({
        sessionId: SESSION,
        runId: RUN,
        onEvent: () => {},
        onExpired: () => {},
        signal: new AbortController().signal,
        fetch: failing.fetch,
        sleep: recorder().sleep,
      }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SseHttpError);
      expect((error as SseHttpError).status).toBe(status);
      expect((error as SseHttpError).code).toBe(code);
      expect(failing.calls).toHaveLength(1);
    }
  });

  it("retries gateway failures (502/503/504 without problem) while the API restarts", async () => {
    const gateway = (status: number) =>
      new Response("<html>bad gateway</html>", {
        status,
        headers: { "content-type": "text/html" },
      });
    const { calls, fetch } = fakeFetch([
      gateway(502),
      gateway(504),
      gateway(503),
      streamResponse([frame(event(1, "agent.run.completed"))]),
    ]);
    const { sleeps, sleep } = recorder();
    const seen: number[] = [];
    await subscribeRun({
      sessionId: SESSION,
      runId: RUN,
      onEvent: (e) => seen.push(e.sequence),
      onExpired: () => {},
      signal: new AbortController().signal,
      fetch,
      sleep,
    });
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(seen).toEqual([1]);
  });

  it("reports 401 and 410 without reconnecting", async () => {
    const unauthorized = fakeFetch([problem(401, "SESSION_INVALID")]);
    let loggedOut = 0;
    await subscribeRun({
      sessionId: SESSION,
      runId: RUN,
      onEvent: () => {},
      onExpired: () => {},
      onUnauthorized: () => {
        loggedOut += 1;
      },
      signal: new AbortController().signal,
      fetch: unauthorized.fetch,
      sleep: recorder().sleep,
    });
    expect(loggedOut).toBe(1);
    expect(unauthorized.calls).toHaveLength(1);

    const expired = fakeFetch([problem(410, "EVENT_REPLAY_UNAVAILABLE")]);
    let recovered = 0;
    await subscribeRun({
      sessionId: SESSION,
      runId: RUN,
      lastEventId: `${RUN}:3`,
      onEvent: () => {},
      onExpired: () => {
        recovered += 1;
      },
      signal: new AbortController().signal,
      fetch: expired.fetch,
      sleep: recorder().sleep,
    });
    expect(recovered).toBe(1);
    expect(expired.calls).toHaveLength(1);
  });

  it("stops without further requests once aborted", async () => {
    const controller = new AbortController();
    const { calls, fetch } = fakeFetch([
      new TypeError("down"),
      new TypeError("down"),
    ]);
    await subscribeRun({
      sessionId: SESSION,
      runId: RUN,
      onEvent: () => {},
      onExpired: () => {},
      signal: controller.signal,
      fetch,
      sleep: async () => {
        controller.abort();
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].signal).toBe(controller.signal);
  });

  it("ignores frames that belong to another run", async () => {
    const other = { ...event(1, "agent.run.completed"), run_id: SESSION };
    const { fetch } = fakeFetch([
      streamResponse([frame(other), frame(event(1, "agent.run.completed"))]),
    ]);
    const seen: string[] = [];
    await subscribeRun({
      sessionId: SESSION,
      runId: RUN,
      onEvent: (e) => seen.push(e.run_id),
      onExpired: () => {},
      signal: new AbortController().signal,
      fetch,
      sleep: recorder().sleep,
    });
    expect(seen).toEqual([RUN]);
  });
});
