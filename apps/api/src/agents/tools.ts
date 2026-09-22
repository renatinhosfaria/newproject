import { Inject, Injectable } from "@nestjs/common";
import type {
  AgentResult,
  Conversation,
  Lead,
  Message,
} from "@pacaembu/contracts";
import { LeadsService } from "../crm/leads.service.js";
import { ConversationsService } from "../crm/conversations.service.js";
import { problem, ProblemError } from "../http/problem.filter.js";
import { AgentsService } from "./agents.service.js";
import type { Capability, RunContext } from "./hermes.port.js";

@Injectable()
export class Tools {
  constructor(
    @Inject(AgentsService) private readonly agents: AgentsService,
    @Inject(LeadsService) private readonly leads: LeadsService,
    @Inject(ConversationsService)
    private readonly conversations: ConversationsService,
  ) {}
  private async call<T>(
    ctx: RunContext,
    tool: Capability,
    perform: () => Promise<T>,
  ): Promise<T> {
    try {
      await this.agents.scoped(ctx, async (tx) => {
        const permissions = await this.agents.authorize(tx, ctx, ctx.agent_id);
        if (!ctx.permissions.includes(tool) || !permissions.includes(tool))
          throw problem(403, "AGENT_CAPABILITY_DENIED");
      });
      const result = await perform();
      await this.agents.scoped(ctx, (tx) =>
        this.agents.auditEvent(
          tx,
          ctx,
          "agent.tool.called",
          ctx.run_id,
          "agent_run",
          { tool },
        ),
      );
      return result;
    } catch (error) {
      if (error instanceof ProblemError)
        await this.agents.scoped(ctx, (tx) =>
          this.agents.auditEvent(
            tx,
            ctx,
            "agent.tool.denied",
            ctx.run_id,
            "agent_run",
            { tool, code: error.code },
          ),
        );
      throw error;
    }
  }
  readLead(ctx: RunContext, id: string): Promise<Lead> {
    return this.call(ctx, "crm.lead.read", () => {
      if (id !== ctx.lead_id) throw problem(404, "RESOURCE_NOT_FOUND");
      return this.leads.get(ctx, id);
    });
  }
  readConversation(
    ctx: RunContext,
    id: string,
  ): Promise<{ conversation: Conversation; messages: Message[] }> {
    return this.call(ctx, "crm.conversation.read", async () => {
      if (id !== ctx.conversation_id) throw problem(404, "RESOURCE_NOT_FOUND");
      const conversation = await this.conversations.get(ctx, id);
      const messages: Message[] = [];
      let page = 1;
      while (true) {
        const result = await this.conversations.messages(ctx, id, {
          page,
          page_size: 100,
        });
        messages.push(...result.items);
        if (messages.length >= result.page.total) break;
        page++;
      }
      return { conversation, messages };
    });
  }
  validateDraft(ctx: RunContext, text: string): Promise<AgentResult> {
    return this.call(ctx, "crm.message.draft", async () => {
      if (!text.trim() || text.length > 12000)
        throw problem(422, "INVALID_AGENT_OUTPUT");
      return {
        type: "draft",
        content: text,
        citations: [],
        proposed_actions: [],
        requires_approval: false,
        status: "completed",
        request_id: ctx.request_id,
      };
    });
  }
}
