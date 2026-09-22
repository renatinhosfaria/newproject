import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import {
  CreateConversationRequestSchema,
  IdempotencyKeySchema,
  PageQuerySchema,
  UuidSchema,
  type CreateConversationRequest,
} from "@pacaembu/contracts";
import type { AuthenticatedRequest } from "../auth/session.guard.js";
import { SessionGuard } from "../auth/session.guard.js";
import { requireBroker } from "../auth/policies.js";
import { requestIdOf } from "../http/problem.filter.js";
import { ConversationsService } from "./conversations.service.js";

const ConversationListQuerySchema = PageQuerySchema.extend({
  search: z.string().max(120).optional(),
});

@Controller("api/conversations")
@UseGuards(SessionGuard)
export class ConversationsController {
  constructor(
    @Inject(ConversationsService)
    private readonly conversations: ConversationsService,
  ) {}

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    const input = CreateConversationRequestSchema.parse(
      body,
    ) as CreateConversationRequest;
    const key = IdempotencyKeySchema.parse(idempotencyKey);
    const conversation = await this.conversations.create(ctx, input, key);
    return reply.status(201).send(conversation);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    const input = ConversationListQuerySchema.parse(query);
    return this.conversations.list(ctx, input);
  }

  @Get(":conversationId")
  get(
    @Req() req: AuthenticatedRequest,
    @Param("conversationId") conversationId: string,
  ) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    return this.conversations.get(ctx, UuidSchema.parse(conversationId));
  }

  @Get(":conversationId/messages")
  messages(
    @Req() req: AuthenticatedRequest,
    @Param("conversationId") conversationId: string,
    @Query() query: unknown,
  ) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    const input = PageQuerySchema.parse(query);
    return this.conversations.messages(
      ctx,
      UuidSchema.parse(conversationId),
      input,
    );
  }
}
