import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  AgentMessageRequestSchema,
  CreateAgentSessionRequestSchema,
  IdempotencyKeySchema,
  UuidSchema,
} from "@pacaembu/contracts";
import {
  SessionGuard,
  type AuthenticatedRequest,
} from "../auth/session.guard.js";
import { requireBroker } from "../auth/policies.js";
import { requestIdOf } from "../http/problem.filter.js";
import { AgentsService } from "./agents.service.js";
@Controller("api")
@UseGuards(SessionGuard)
export class AgentsController {
  constructor(@Inject(AgentsService) private readonly agents: AgentsService) {}
  @Get("agents") catalog(@Req() req: AuthenticatedRequest) {
    return this.agents.catalog(req.user!);
  }
  @Post("agent-sessions") async create(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
    @Headers("idempotency-key") key: unknown,
    @Res() reply: FastifyReply,
  ) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    return reply
      .status(201)
      .send(
        await this.agents.createSession(
          ctx,
          CreateAgentSessionRequestSchema.parse(body),
          IdempotencyKeySchema.parse(key),
        ),
      );
  }
  @Get("agent-sessions/:id") session(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
  ) {
    return this.agents.session(
      requireBroker(req.user!, requestIdOf(req)),
      UuidSchema.parse(id),
    );
  }
  @Post("agent-sessions/:id/messages") async send(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: unknown,
    @Res() reply: FastifyReply,
  ) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    return reply
      .status(202)
      .send(
        await this.agents.send(
          ctx,
          UuidSchema.parse(id),
          AgentMessageRequestSchema.parse(body),
          IdempotencyKeySchema.parse(key),
        ),
      );
  }
}
