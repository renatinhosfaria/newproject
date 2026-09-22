import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import {
  CreateLeadRequestSchema,
  LeadStageSchema,
  PageQuerySchema,
  UpdateLeadRequestSchema,
  UuidSchema,
  type CreateLeadRequest,
  type UpdateLeadRequest,
} from "@pacaembu/contracts";
import type { AuthenticatedRequest } from "../auth/session.guard.js";
import { SessionGuard } from "../auth/session.guard.js";
import { requireBroker } from "../auth/policies.js";
import { requestIdOf } from "../http/problem.filter.js";
import { LeadsService } from "./leads.service.js";

const LeadListQuerySchema = PageQuerySchema.extend({
  search: z.string().max(120).optional(),
  stage: LeadStageSchema.optional(),
});

@Controller("api/leads")
@UseGuards(SessionGuard)
export class LeadsController {
  constructor(@Inject(LeadsService) private readonly leads: LeadsService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    const input = CreateLeadRequestSchema.parse(body) as CreateLeadRequest;
    return this.leads.create(ctx, input);
  }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    const input = LeadListQuerySchema.parse(query);
    return this.leads.list(ctx, input);
  }

  @Get(":leadId")
  get(@Req() req: AuthenticatedRequest, @Param("leadId") leadId: string) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    return this.leads.get(ctx, UuidSchema.parse(leadId));
  }

  @Patch(":leadId")
  update(
    @Req() req: AuthenticatedRequest,
    @Param("leadId") leadId: string,
    @Body() body: unknown,
  ) {
    const ctx = requireBroker(req.user!, requestIdOf(req));
    const input = UpdateLeadRequestSchema.parse(body) as UpdateLeadRequest;
    return this.leads.update(ctx, UuidSchema.parse(leadId), input);
  }
}
