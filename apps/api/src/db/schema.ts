import {
  boolean,
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  primaryKey,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

const id = () => uuid("id").defaultRandom().primaryKey();
const citext = customType<{ data: string }>({ dataType: () => "citext" });
const created = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const workspaceId = () => uuid("workspace_id").notNull();
const brokerId = () => uuid("broker_id").notNull();

export const workspaceStatus = pgEnum("workspace_status", [
  "active",
  "suspended",
]);
export const userStatus = pgEnum("user_status", [
  "invited",
  "active",
  "suspended",
]);
export const membershipRole = pgEnum("membership_role", [
  "broker",
  "supervisor",
]);
export const brokerStatus = pgEnum("broker_status", [
  "onboarding",
  "active",
  "suspended",
  "offboarded",
]);
export const leadStage = pgEnum("lead_stage", [
  "novo",
  "contato",
  "visita",
  "proposta",
  "aprovado",
  "perdido",
]);
export const conversationStatus = pgEnum("conversation_status", [
  "open",
  "waiting",
  "closed",
  "archived",
]);
export const messageDirection = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);
export const messageAuthor = pgEnum("message_author", [
  "lead",
  "broker",
  "agent",
  "system",
]);
export const messageStatus = pgEnum("message_status", [
  "received",
  "processing",
  "draft",
  "failed",
]);
export const agentStatus = pgEnum("agent_status", ["active", "disabled"]);
export const agentSessionStatus = pgEnum("agent_session_status", [
  "active",
  "stopped",
  "completed",
  "failed",
]);
export const agentRunStatus = pgEnum("agent_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: varchar("name", { length: 160 }).notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull(),
  status: workspaceStatus("status").notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
export const users = pgTable(
  "users",
  {
    id: id(),
    name: varchar("name", { length: 160 }).notNull(),
    email: citext("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: userStatus("status").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => ({ emailUnique: unique("users_email_unique").on(table.email) }),
);
export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    id: id(),
    workspaceId: workspaceId(),
    userId: uuid("user_id").notNull(),
    role: membershipRole("role").notNull(),
    status: userStatus("status").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => ({
    workspaceUserUnique: unique(
      "workspace_memberships_workspace_user_unique",
    ).on(table.workspaceId, table.userId),
  }),
);
export const authSessions = pgTable("auth_sessions", {
  id: id(),
  userId: uuid("user_id").notNull(),
  workspaceId: workspaceId(),
  membershipId: uuid("membership_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: created(),
});
export const brokers = pgTable(
  "brokers",
  {
    id: id(),
    workspaceId: workspaceId(),
    userId: uuid("user_id").notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    registrationCode: varchar("registration_code", { length: 80 }),
    status: brokerStatus("status").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => ({
    workspaceUserUnique: unique("brokers_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
  }),
);
export const leads = pgTable("leads", {
  id: id(),
  workspaceId: workspaceId(),
  brokerId: brokerId(),
  name: varchar("name", { length: 160 }).notNull(),
  phoneNormalized: varchar("phone_normalized", { length: 40 }),
  email: citext("email"),
  source: varchar("source", { length: 80 }),
  stage: leadStage("stage").notNull(),
  interest: varchar("interest", { length: 160 }),
  nextAction: varchar("next_action", { length: 200 }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});
export const conversations = pgTable("conversations", {
  id: id(),
  workspaceId: workspaceId(),
  brokerId: brokerId(),
  leadId: uuid("lead_id").notNull(),
  status: conversationStatus("status").notNull(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
});
export const messages = pgTable("messages", {
  id: id(),
  workspaceId: workspaceId(),
  brokerId: brokerId(),
  conversationId: uuid("conversation_id").notNull(),
  externalMessageId: varchar("external_message_id", { length: 255 }),
  direction: messageDirection("direction").notNull(),
  author: messageAuthor("author").notNull(),
  status: messageStatus("status").notNull(),
  content: text("content").notNull(),
  metadataJson: jsonb("metadata_json")
    .$type<Record<string, unknown>>()
    .notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});
export const agents = pgTable("agents", {
  id: id(),
  key: varchar("key", { length: 80 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull(),
  status: agentStatus("status").notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
export const agentCapabilities = pgTable("agent_capabilities", {
  id: id(),
  agentId: uuid("agent_id").notNull(),
  key: varchar("key", { length: 120 }).notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
export const workspaceAgents = pgTable(
  "workspace_agents",
  {
    workspaceId: workspaceId(),
    agentId: uuid("agent_id").notNull(),
    enabled: boolean("enabled").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.agentId] }),
  }),
);
export const agentSessions = pgTable("agent_sessions", {
  id: id(),
  workspaceId: workspaceId(),
  brokerId: brokerId(),
  userId: uuid("user_id").notNull(),
  agentId: uuid("agent_id").notNull(),
  leadId: uuid("lead_id"),
  conversationId: uuid("conversation_id"),
  title: varchar("title", { length: 160 }).notNull(),
  status: agentSessionStatus("status").notNull(),
  membershipRole: membershipRole("membership_role").notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
export const agentRuns = pgTable(
  "agent_runs",
  {
    runId: uuid("run_id").defaultRandom().primaryKey(),
    workspaceId: workspaceId(),
    brokerId: brokerId(),
    sessionId: uuid("session_id").notNull(),
    status: agentRunStatus("status").notNull(),
    inputContent: text("input_content").notNull(),
    requestId: varchar("request_id", { length: 160 })
      .default("legacy-run")
      .notNull(),
    resultJson: jsonb("result_json").$type<Record<string, unknown>>(),
    errorCode: varchar("error_code", { length: 120 }),
    outputMessageId: uuid("output_message_id"),
    eventsExpireAt: timestamp("events_expire_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (table) => ({
    outputMessageUnique: uniqueIndex("agent_runs_output_message_unique")
      .on(table.outputMessageId)
      .where(sql`${table.outputMessageId} IS NOT NULL`),
  }),
);
export const agentEvents = pgTable(
  "agent_events",
  {
    id: id(),
    workspaceId: workspaceId(),
    brokerId: brokerId(),
    sessionId: uuid("session_id").notNull(),
    runId: uuid("run_id").notNull(),
    sequence: integer("sequence").notNull(),
    type: varchar("type", { length: 160 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    requestId: varchar("request_id", { length: 160 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: created(),
  },
  (table) => ({
    runSequenceUnique: unique("agent_events_run_id_sequence_key").on(
      table.runId,
      table.sequence,
    ),
  }),
);
export const idempotencyRecords = pgTable("idempotency_records", {
  id: id(),
  workspaceId: workspaceId(),
  userId: uuid("user_id").notNull(),
  brokerId: uuid("broker_id"),
  operation: varchar("operation", { length: 160 }).notNull(),
  resourceType: varchar("resource_type", { length: 120 }).notNull(),
  resourceId: uuid("resource_id"),
  key: varchar("key", { length: 128 }).notNull(),
  requestHash: varchar("request_hash", { length: 128 }).notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});
export const auditEvents = pgTable("audit_events", {
  id: id(),
  workspaceId: workspaceId(),
  actorUserId: uuid("actor_user_id").notNull(),
  brokerId: uuid("broker_id"),
  eventType: varchar("event_type", { length: 160 }).notNull(),
  resourceType: varchar("resource_type", { length: 120 }).notNull(),
  resourceId: uuid("resource_id"),
  requestId: varchar("request_id", { length: 160 }).notNull(),
  metadataJson: jsonb("metadata_json")
    .$type<Record<string, unknown>>()
    .notNull(),
  createdAt: created(),
});

export const schema = {
  workspaces,
  users,
  workspaceMemberships,
  authSessions,
  brokers,
  leads,
  conversations,
  messages,
  agents,
  agentCapabilities,
  workspaceAgents,
  agentSessions,
  agentRuns,
  agentEvents,
  idempotencyRecords,
  auditEvents,
};
export type Schema = typeof schema;
