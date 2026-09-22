import { AgentEventSchema, type AgentEvent } from "@pacaembu/contracts";
import type { TestHarness } from "./harness.js";

export async function listenSse(h: TestHarness): Promise<string> {
  await h.app.listen(0, "127.0.0.1");
  return h.app.getUrl();
}

// Incremental parser: CRLF can straddle chunks; data lines join with a newline.
export class SseParser {
  private buffer = "";
  push(chunk: string): AgentEvent[] {
    this.buffer += chunk;
    const events: AgentEvent[] = [];
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/.exec(this.buffer))) {
      const frame = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) events.push(AgentEventSchema.parse(JSON.parse(data)));
    }
    return events;
  }
}

export async function readSse(
  url: string,
  headers: Record<string, string>,
  options: {
    until?: (event: AgentEvent) => boolean | Promise<boolean>;
    signal: AbortSignal;
  },
): Promise<AgentEvent[]> {
  const response = await fetch(url, { headers, signal: options.signal });
  if (!response.ok)
    throw new Error(`SSE HTTP ${response.status}: ${await response.text()}`);
  if (!response.headers.get("content-type")?.startsWith("text/event-stream"))
    throw new Error("SSE content type missing");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  const events: AgentEvent[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return events;
      for (const event of parser.push(
        decoder.decode(next.value, { stream: true }),
      )) {
        events.push(event);
        if (await options.until?.(event)) return events;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
