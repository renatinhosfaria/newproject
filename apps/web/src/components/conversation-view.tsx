"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  AgentCatalogItemSchema,
  AgentSessionSchema,
  ConversationSchema,
  LeadSchema,
  MessagePageSchema,
  type AgentCatalogItem,
  type Conversation,
  type Lead,
  type Message,
} from "@pacaembu/contracts";
import {
  api,
  describeError,
  newIdempotencyKey,
  postIdempotent,
} from "../lib/api";
import { useSessionEnded } from "./app-shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Loading,
  PageHeader,
  formatDateTime,
  styles,
} from "./ui";

const CAPABILITY_LABEL: Record<string, string> = {
  "crm.lead.read": "Ler lead",
  "crm.conversation.read": "Ler conversa",
  "crm.message.draft": "Preparar rascunho",
};

const STATUS_LABEL: Record<Message["status"], string> = {
  received: "Recebida",
  processing: "Processando",
  draft: "Rascunho não enviado",
  failed: "Falhou",
};

interface Data {
  conversation: Conversation;
  lead: Lead;
  messages: Message[];
  agents: AgentCatalogItem[];
}

export function MessageBubble({ message }: { message: Message }) {
  const fromAgent = message.author === "agent";
  const className = [
    styles.bubble,
    message.direction === "inbound" ? styles.bubbleInbound : styles.bubbleAgent,
    message.status === "draft" ? styles.bubbleDraft : "",
    message.status === "failed" ? styles.bubbleError : "",
  ].join(" ");
  return (
    <article className={className}>
      <div className={styles.bubbleHead}>
        <strong>
          {message.direction === "inbound"
            ? "Mensagem do lead"
            : fromAgent
              ? "Agent Atendimento"
              : "Corretor"}
        </strong>
        <Badge
          tone={
            message.status === "draft"
              ? "draft"
              : message.status === "failed"
                ? "error"
                : "neutral"
          }
        >
          {STATUS_LABEL[message.status]}
        </Badge>
        {fromAgent ? <Badge tone="agent">Simulado</Badge> : null}
        <span className={styles.meta}>
          {formatDateTime(message.occurred_at)}
        </span>
      </div>
      {/* React escapes text: external content is never interpreted as HTML. */}
      <p>{message.content}</p>
    </article>
  );
}

export function ConversationView({
  conversationId,
}: {
  conversationId: string;
}) {
  const router = useRouter();
  const sessionEnded = useSessionEnded();
  const [data, setData] = useState<
    | { state: "loading" }
    | { state: "error"; message: string }
    | { state: "ready"; value: Data }
  >({ state: "loading" });
  const [reload, setReload] = useState(0);
  const [starting, setStarting] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const sessionKey = useRef<{ agent: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    (async () => {
      const conversation = await api(
        `/api/conversations/${conversationId}`,
        { signal },
        ConversationSchema,
      );
      const [lead, messages, agents] = await Promise.all([
        api(`/api/leads/${conversation.lead_id}`, { signal }, LeadSchema),
        api(
          `/api/conversations/${conversationId}/messages?page_size=100`,
          { signal },
          MessagePageSchema,
        ),
        api("/api/agents", { signal }, z.array(AgentCatalogItemSchema)),
      ]);
      setData({
        state: "ready",
        value: { conversation, lead, messages: messages.items, agents },
      });
    })().catch((error: unknown) => {
      if (signal.aborted || sessionEnded(error)) return;
      setData({ state: "error", message: describeError(error) });
    });
    return () => controller.abort();
  }, [conversationId, reload, sessionEnded]);

  async function startSession(agent: AgentCatalogItem) {
    if (sessionKey.current?.agent !== agent.id)
      sessionKey.current = { agent: agent.id, key: newIdempotencyKey() };
    setStarting(agent.id);
    setFailure(null);
    try {
      const session = await postIdempotent(
        "/api/agent-sessions",
        { agent_id: agent.id, conversation_id: conversationId },
        AgentSessionSchema,
        sessionKey.current.key,
      );
      sessionKey.current = null;
      router.push(`/agents/${session.id}`);
    } catch (error) {
      setStarting(null);
      if (sessionEnded(error)) return;
      setFailure(describeError(error));
    }
  }

  if (data.state === "loading") return <Loading>Carregando conversa…</Loading>;
  if (data.state === "error")
    return (
      <div className={styles.stack}>
        <Alert>{data.message}</Alert>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setData({ state: "loading" });
              setReload((n) => n + 1);
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );

  const { lead, messages, agents, conversation } = data.value;
  return (
    <>
      <PageHeader
        eyebrow="Conversa"
        title={`Conversa com ${lead.name}`}
        description={`Aberta em ${formatDateTime(conversation.created_at)}. Nenhuma mensagem é enviada ao lead neste ciclo.`}
        actions={
          <Link href={`/leads?lead=${lead.id}`}>Voltar para o lead</Link>
        }
      />
      <div className={styles.agentLayout}>
        <Card labelledBy="messages-title">
          <div className={styles.cardHeader}>
            <h2 id="messages-title">Mensagens</h2>
            <span className={styles.meta}>
              {messages.length}{" "}
              {messages.length === 1 ? "mensagem" : "mensagens"}
            </span>
          </div>
          {messages.length === 0 ? (
            <EmptyState title="Nenhuma mensagem nesta conversa">
              <p>Peça ao Agent Atendimento um rascunho de resposta.</p>
            </EmptyState>
          ) : (
            <div
              className={styles.history}
              role="log"
              aria-label="Mensagens da conversa"
            >
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </div>
          )}
        </Card>
        <aside className={styles.contextPanel} aria-label="Agents">
          <Card labelledBy="agents-title">
            <div className={styles.cardHeader}>
              <h2 id="agents-title">Agents</h2>
              <Badge tone="agent">Simulado</Badge>
            </div>
            {failure ? <Alert>{failure}</Alert> : null}
            {agents.length === 0 ? (
              <EmptyState title="Nenhum Agent liberado">
                <p>O workspace ainda não habilitou Agents.</p>
              </EmptyState>
            ) : (
              <ul className={styles.list}>
                {agents.map((agent) => (
                  <li key={agent.id} className={styles.stack}>
                    <div className={styles.row}>
                      <span className={styles.agentAvatar} aria-hidden="true">
                        {agent.name.slice(0, 1)}
                      </span>
                      <Button
                        variant="secondary"
                        busy={starting === agent.id}
                        disabled={agent.status !== "online"}
                        onClick={() => startSession(agent)}
                      >
                        {agent.name}
                      </Button>
                    </div>
                    <p className={styles.meta}>
                      {agent.description}. Capacidades:{" "}
                      {agent.capabilities
                        .map((c) => CAPABILITY_LABEL[c] ?? c)
                        .join(", ")}
                      .
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
