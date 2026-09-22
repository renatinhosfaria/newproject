// Browser client for GET /api/agent-sessions/{id}/events.
// Uses fetch + ReadableStream instead of EventSource: the UI must read the HTTP
// status (401 → login, 410 → recover from GET session) and send Last-Event-ID
// on its own reconnections. The session cookie travels same-origin only.
// Kept free of relative imports so the unit suite can load it directly.
import {
  AgentEventSchema,
  ProblemSchema,
  type AgentEvent,
} from "@pacaembu/contracts";

export const TERMINAL_EVENTS = new Set([
  "agent.run.completed",
  "agent.run.failed",
  "agent.run.cancelled",
]);

const BACKOFF_MS = [1000, 2000, 4000, 8000];
const MAX_BACKOFF_MS = 10_000;

export class SseHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`SSE HTTP ${status} ${code}`);
    this.name = "SseHttpError";
  }
}

/** Incremental parser: bytes may split frames, CRLF pairs or UTF-8 sequences. */
export function createSseParser(): { push(chunk: Uint8Array): AgentEvent[] } {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  return {
    push(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
      const events: AgentEvent[] = [];
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = frame
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        // Comment-only frames (heartbeats) carry no data.
        if (!data) continue;
        const parsed = AgentEventSchema.safeParse(safeJson(data));
        if (parsed.success) events.push(parsed.data);
      }
      return events;
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export interface SubscribeRunOptions {
  sessionId: string;
  runId: string;
  /** Cursor `<run_id>:<sequence>` of the last event already applied. */
  lastEventId?: string;
  onEvent(event: AgentEvent): void;
  /** 410: replay no longer available; recover state from GET session. */
  onExpired(): void | Promise<void>;
  /** 401: the authenticated session ended. */
  onUnauthorized?(): void;
  onConnectionChange?(state: "open" | "reconnecting"): void;
  signal: AbortSignal;
  fetch?: typeof fetch;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

async function readProblem(response: Response): Promise<{
  code: string;
  retryable: boolean;
}> {
  const parsed = ProblemSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  return parsed.success
    ? { code: parsed.data.code, retryable: parsed.data.retryable }
    : { code: "HTTP_ERROR", retryable: false };
}

/**
 * Follows one run until a terminal event, reconnecting with Last-Event-ID on
 * network failures or streams that end early. Events are applied at most once
 * per subscription (`seen`), even when a replay repeats them.
 */
export async function subscribeRun(
  options: SubscribeRunOptions,
): Promise<void> {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? abortableSleep;
  const { signal, runId } = options;
  const seen = new Set<string>();
  let cursor = options.lastEventId;
  let attempt = 0;

  function applyEvent(event: AgentEvent) {
    if (seen.has(event.id)) return;
    seen.add(event.id);
    cursor = `${event.run_id}:${event.sequence}`;
    options.onEvent(event);
  }

  async function backoff(): Promise<void> {
    options.onConnectionChange?.("reconnecting");
    const delay = BACKOFF_MS[attempt] ?? MAX_BACKOFF_MS;
    attempt += 1;
    await sleep(Math.min(delay, MAX_BACKOFF_MS), signal);
  }

  while (!signal.aborted) {
    const headers: Record<string, string> = { Accept: "text/event-stream" };
    if (cursor) headers["Last-Event-ID"] = cursor;
    let response: Response;
    try {
      response = await doFetch(
        `/api/agent-sessions/${encodeURIComponent(options.sessionId)}/events?run_id=${encodeURIComponent(runId)}`,
        { headers, credentials: "same-origin", cache: "no-store", signal },
      );
    } catch {
      if (signal.aborted) return;
      await backoff();
      continue;
    }

    if (response.status === 401) {
      options.onUnauthorized?.();
      return;
    }
    if (response.status === 410) {
      await options.onExpired();
      return;
    }
    if (!response.ok || !response.body) {
      const problem = await readProblem(response);
      if (response.status === 503 && problem.retryable) {
        await backoff();
        continue;
      }
      // An HTTP error is not "no result yet": surface it to the caller.
      throw new SseHttpError(response.status, problem.code);
    }

    options.onConnectionChange?.("open");
    const parser = createSseParser();
    const reader = response.body.getReader();
    let terminal = false;
    try {
      while (!terminal) {
        const next = await reader.read();
        if (next.done) break;
        for (const event of parser.push(next.value)) {
          if (event.run_id !== runId) continue;
          attempt = 0;
          applyEvent(event);
          if (TERMINAL_EVENTS.has(event.type)) {
            terminal = true;
            break;
          }
        }
      }
    } catch {
      // Connection dropped mid-stream; reconnect below with the cursor.
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (terminal || signal.aborted) return;
    await backoff();
  }
}
