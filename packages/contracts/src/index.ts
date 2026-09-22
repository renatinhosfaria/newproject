import { z } from "zod";

export const UuidSchema = z.string().uuid();
export type Uuid = z.infer<typeof UuidSchema>;

const NullableDateTimeSchema = z.string().datetime({ offset: true }).nullable();
const DateTimeSchema = z.string().datetime({ offset: true });

export const ProblemSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.number().int().min(100).max(599),
  code: z.string().min(1),
  detail: z.string().optional(),
  request_id: z.string().min(1),
  retryable: z.boolean(),
});
export type Problem = z.infer<typeof ProblemSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  workspace_id: UuidSchema.optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RoleSchema = z.enum(["broker", "supervisor"]);
export const SessionUserSchema = z.object({
  id: UuidSchema,
  membership_id: UuidSchema,
  name: z.string().min(1),
  email: z.string().email(),
  role: RoleSchema,
  workspace_id: UuidSchema,
  broker_id: UuidSchema.nullable(),
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const BrokerContextSchema = z.object({
  user_id: z.string().min(1),
  workspace_id: z.string().min(1),
  membership_id: z.string().min(1),
  broker_id: z.string().min(1),
  role: z.literal("broker"),
  request_id: z.string().min(1),
});
export type BrokerContext = z.infer<typeof BrokerContextSchema>;

export const LeadStageSchema = z.enum([
  "novo",
  "contato",
  "visita",
  "proposta",
  "aprovado",
  "perdido",
]);
export type LeadStage = z.infer<typeof LeadStageSchema>;

const LeadFieldsSchema = {
  name: z.string().min(2).max(160),
  phone: z.string().max(40).nullable(),
  email: z.string().email().nullable(),
  source: z.string().max(80).nullable(),
  interest: z.string().max(160).nullable(),
  next_action: z.string().max(200).nullable(),
};

export const LeadSchema = z.object({
  id: UuidSchema,
  broker_id: UuidSchema,
  ...LeadFieldsSchema,
  stage: LeadStageSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Lead = z.infer<typeof LeadSchema>;
export const LeadPageSchema = z.object({
  items: z.array(LeadSchema),
  page: z.object({
    page: z.number().int().min(1),
    page_size: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
  }),
});
export type LeadPage = z.infer<typeof LeadPageSchema>;

export const CreateLeadRequestSchema = z.object({
  name: LeadFieldsSchema.name,
  phone: LeadFieldsSchema.phone.optional(),
  email: LeadFieldsSchema.email.optional(),
  source: LeadFieldsSchema.source.optional(),
  interest: LeadFieldsSchema.interest.optional(),
});
export type CreateLeadRequest = z.infer<typeof CreateLeadRequestSchema>;

export const UpdateLeadRequestSchema = z
  .object({
    name: LeadFieldsSchema.name.optional(),
    phone: LeadFieldsSchema.phone.optional(),
    email: LeadFieldsSchema.email.optional(),
    stage: LeadStageSchema.optional(),
    interest: LeadFieldsSchema.interest.optional(),
    next_action: LeadFieldsSchema.next_action.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field is required",
  });
export type UpdateLeadRequest = z.infer<typeof UpdateLeadRequestSchema>;

export const ConversationStatusSchema = z.enum([
  "open",
  "waiting",
  "closed",
  "archived",
]);
export const ConversationSchema = z.object({
  id: UuidSchema,
  broker_id: UuidSchema,
  lead_id: UuidSchema,
  status: ConversationStatusSchema,
  last_message_at: NullableDateTimeSchema,
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type Conversation = z.infer<typeof ConversationSchema>;
export const ConversationPageSchema = z.object({
  items: z.array(ConversationSchema),
  page: z.object({
    page: z.number().int().min(1),
    page_size: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
  }),
});
export type ConversationPage = z.infer<typeof ConversationPageSchema>;

export const CreateConversationRequestSchema = z.object({
  lead_id: UuidSchema,
  title: z.string().max(160).optional(),
});
export type CreateConversationRequest = z.infer<
  typeof CreateConversationRequestSchema
>;

export const MessageDirectionSchema = z.enum(["inbound", "outbound"]);
export const MessageAuthorSchema = z.enum([
  "lead",
  "broker",
  "agent",
  "system",
]);
export const MessageStatusSchema = z.enum([
  "received",
  "processing",
  "draft",
  "failed",
]);
export const MessageSchema = z.object({
  id: UuidSchema,
  conversation_id: UuidSchema,
  direction: MessageDirectionSchema,
  author: MessageAuthorSchema,
  status: MessageStatusSchema,
  content: z.string().min(1).max(12000),
  occurred_at: DateTimeSchema,
});
export type Message = z.infer<typeof MessageSchema>;
export const MessagePageSchema = z.object({
  items: z.array(MessageSchema),
  page: z.object({
    page: z.number().int().min(1),
    page_size: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
  }),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;

export const AgentSessionStatusSchema = z.enum([
  "active",
  "stopped",
  "completed",
  "failed",
]);
export const CreateAgentSessionRequestSchema = z.object({
  agent_id: z.string().min(1),
  lead_id: UuidSchema.nullable().optional(),
  conversation_id: UuidSchema.nullable().optional(),
  title: z.string().max(160).nullable().optional(),
});
export type CreateAgentSessionRequest = z.infer<
  typeof CreateAgentSessionRequestSchema
>;

export const AgentMessageRequestSchema = z.object({
  content: z.string().min(1).max(12000),
  client_message_id: z.string().max(128).optional(),
});
export type AgentMessageRequest = z.infer<typeof AgentMessageRequestSchema>;

export const AgentResultSchema = z.object({
  type: z.enum(["draft", "error"]),
  content: z.string(),
  citations: z.array(z.string()),
  proposed_actions: z.tuple([]),
  requires_approval: z.literal(false),
  status: z.enum(["completed", "failed", "cancelled"]),
  request_id: z.string().min(1),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

export const AgentRunStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const AgentRunSchema = z.object({
  run_id: z.string().min(1),
  session_id: z.string().min(1),
  status: AgentRunStatusSchema,
  input_content: z.string(),
  result: AgentResultSchema.nullable(),
  error_code: z.string().nullable(),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const AgentSessionSchema = z.object({
  id: UuidSchema,
  agent_id: z.string().min(1),
  lead_id: UuidSchema.nullable(),
  conversation_id: UuidSchema.nullable(),
  title: z.string(),
  status: AgentSessionStatusSchema,
  runs: z.array(AgentRunSchema),
  created_at: DateTimeSchema,
  updated_at: DateTimeSchema,
});
export type AgentSession = z.infer<typeof AgentSessionSchema>;

const AgentEventFieldsSchema = {
  id: z.string().min(1),
  run_id: z.string().min(1),
  session_id: z.string().min(1),
  workspace_id: z.string().min(1),
  broker_id: z.string().min(1),
  sequence: z.number().int().min(1),
  type: z.string().min(1),
  request_id: z.string().min(1),
  occurred_at: DateTimeSchema,
};
export const PersistedAgentEventSchema = z.object({
  ...AgentEventFieldsSchema,
  payload: z.record(z.unknown()),
});
export type PersistedAgentEvent = z.infer<typeof PersistedAgentEventSchema>;

export const AgentEventSchema = z.object({
  ...AgentEventFieldsSchema,
  data: z.record(z.unknown()),
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const IdempotencyKeySchema = z.string().min(16).max(128);
export const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
});

const transitions: Record<string, readonly string[]> = {
  received: ["processing"],
  processing: ["draft"],
  draft: ["failed"],
  failed: [],
};

export function canTransitionMessage(from: string, to: string): boolean {
  return transitions[from]?.includes(to) ?? false;
}
