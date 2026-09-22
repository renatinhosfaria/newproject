import {
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { UuidSchema } from "@pacaembu/contracts";
import type { FastifyReply } from "fastify";
import {
  SessionGuard,
  type AuthenticatedRequest,
} from "../auth/session.guard.js";
import { requireBroker } from "../auth/policies.js";
import { requestIdOf } from "../http/problem.filter.js";
import { EventStore } from "./event-store.js";
import { parseEventCursor, SseStreams } from "./sse.js";

@Controller("api/agent-sessions")
@UseGuards(SessionGuard)
export class EventsController {
  constructor(
    @Inject(EventStore) private readonly store: EventStore,
    @Inject(SseStreams) private readonly streams: SseStreams,
  ) {}
  @Get(":id/events")
  async events(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("run_id") run: unknown,
    @Headers("last-event-id") last: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const sessionId = UuidSchema.parse(id).toLowerCase();
    const runId =
      run === undefined ? undefined : UuidSchema.parse(run).toLowerCase();
    const ctx = requireBroker(req.user!, requestIdOf(req));
    const cursor = last === undefined ? undefined : parseEventCursor(last);
    const state = await this.store.prepare(ctx, sessionId, runId, cursor);
    this.streams.open(
      reply,
      req.sessionToken!,
      sessionId,
      state.runId,
      cursor?.sequence ?? 0,
      ctx.request_id,
    );
  }
}
