import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { UuidSchema, type AgentEvent } from "@pacaembu/contracts";
import type { OutgoingHttpHeaders } from "node:http";
import type { FastifyReply } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { requireBroker } from "../auth/policies.js";
import { problem } from "../http/problem.filter.js";
import { EventStore } from "./event-store.js";

export function parseEventCursor(value: string): {
  runId: string;
  sequence: number;
} {
  const match = /^([^:]+):([1-9][0-9]*)$/.exec(value);
  const id = UuidSchema.safeParse(match?.[1]);
  const sequence = Number(match?.[2]);
  if (!id.success || !Number.isSafeInteger(sequence) || sequence > 2147483647)
    throw problem(422, "INVALID_EVENT_CURSOR");
  return { runId: id.data.toLowerCase(), sequence };
}
export function frameEvent(event: AgentEvent): string {
  return `id: ${event.run_id}:${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
export interface SseScheduler {
  every(ms: number, callback: () => Promise<void>): () => void;
}
export const SSE_SCHEDULER = Symbol("SSE_SCHEDULER");
export const systemSseScheduler: SseScheduler = {
  every(ms, callback) {
    const timer = setInterval(() => {
      void callback();
    }, ms);
    timer.unref();
    return () => clearInterval(timer);
  },
};

@Injectable()
export class SseStreams implements OnModuleDestroy {
  private readonly streams = new Set<() => void>();
  private shuttingDown = false;
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(EventStore) private readonly store: EventStore,
    @Inject(SSE_SCHEDULER) private readonly scheduler: SseScheduler,
  ) {}
  onModuleDestroy(): void {
    this.shuttingDown = true;
    for (const close of this.streams) close();
  }
  open(
    reply: FastifyReply,
    token: string,
    sessionId: string,
    runId: string,
    sequence: number,
    requestId: string,
  ): void {
    const raw = reply.raw;
    // The peer may disconnect while the controller is still authorizing.
    // In that case its close event has already fired.
    if (raw.destroyed || raw.writableEnded) return;
    // Preflight can finish after the shutdown hook closed existing streams.
    // Reject through the HTTP filter so the pending response also terminates.
    if (this.shuttingDown)
      throw problem(503, "SERVER_SHUTTING_DOWN", undefined, true);
    let closed = false;
    let busy = false;
    let heartbeatDue = false;
    const timers: (() => void)[] = [];
    const close = () => {
      if (closed) return;
      closed = true;
      for (const cancel of timers) cancel();
      this.streams.delete(close);
      raw.off("close", close);
      raw.off("error", close);
      raw.end();
    };
    this.streams.add(close);
    raw.on("close", close);
    raw.on("error", close);
    reply.hijack();
    raw.writeHead(200, {
      ...(reply.getHeaders() as OutgoingHttpHeaders),
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    });
    raw.flushHeaders();
    const pump = async (heartbeat = false) => {
      heartbeatDue ||= heartbeat;
      if (closed || busy) return;
      busy = true;
      try {
        const user = await this.auth.resolveSession(token);
        const ctx = requireBroker(user, requestId);
        // Read status before events: a terminal commit racing this batch is
        // observed on the next poll, never used to close over an older batch.
        const state = await this.store.prepare(ctx, sessionId, runId);
        const events = await this.store.after(ctx, sessionId, runId, sequence);
        if (closed) return;
        // Bound memory for slow clients. The next tick still reauthorizes.
        if (raw.writableNeedDrain) return;
        for (const event of events) {
          raw.write(frameEvent(event));
          sequence = event.sequence;
        }
        if (state.terminal && sequence >= state.lastSequence) {
          close();
          return;
        }
        if (heartbeatDue) {
          raw.write(": heartbeat\n\n");
          heartbeatDue = false;
        }
      } catch {
        // Headers have already been sent. Revocation/storage errors terminate
        // silently; no error details or extra event can escape authorization.
        close();
      } finally {
        busy = false;
      }
    };
    timers.push(this.scheduler.every(250, () => pump()));
    timers.push(this.scheduler.every(15000, () => pump(true)));
    void pump();
  }
}
