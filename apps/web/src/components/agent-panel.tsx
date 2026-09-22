"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  AgentResultSchema,
  AgentRunAcceptedSchema,
  AgentSessionSchema,
  LeadSchema,
  type AgentEvent,
  type AgentResult,
  type AgentRun,
  type AgentSession,
  type Lead,
} from "@pacaembu/contracts";
import {
  api,
  describeError,
  newIdempotencyKey,
  postIdempotent,
} from "../lib/api";
import { SseHttpError, subscribeRun } from "../lib/sse-client";
import { useSessionEnded } from "./app-shell";
import {
  Alert,
  Badge,
  Button,
  Card,
  Loading,
  formatDateTime,
  styles,
} from "./ui";

const STEP_LABEL: Record<string, string> = {
  "agent.run.started": "Execução iniciada",
  "crm.lead.read": "Consultou o lead",
  "crm.conversation.read": "Consultou a conversa",
  "crm.message.draft": "Preparou o rascunho",
};

const FAILURE_DETAIL: Record<string, string> = {
  HERMES_PROFILE_UNAVAILABLE: "O Agent simulado está indisponível no momento.",
  RUN_INTERRUPTED: "A execução foi interrompida antes de terminar.",
  RUN_CANCELLED: "A execução foi cancelada.",
};

/** Live view of a run followed by this page. Kept in memory only. */
interface LiveRun {
  steps: string[];
  output?: AgentResult;
  reconnecting: boolean;
}

function stepOf(event: AgentEvent): string | undefined {
  if (event.type === "agent.run.started") return STEP_LABEL[event.type];
  if (event.type === "agent.tool.called" && typeof event.data.tool === "string")
    return STEP_LABEL[event.data.tool];
  return undefined;
}

const isActive = (run: AgentRun) =>
  run.status === "queued" || run.status === "running";

function RunView({
  run,
  live,
  canRetry,
  onRetry,
}: {
  run: AgentRun;
  live?: LiveRun;
  canRetry: boolean;
  onRetry(content: string): void;
}) {
  const result = run.result ?? live?.output ?? null;
  const failed = run.status === "failed" || run.status === "cancelled";
  return (
    <div className={styles.stack}>
      <article className={[styles.bubble, styles.bubbleUser].join(" ")}>
        <div className={styles.bubbleHead}>
          <strong>Você</strong>
          <span className={styles.meta}>{formatDateTime(run.created_at)}</span>
        </div>
        <p data-testid="run-input">{run.input_content}</p>
      </article>
      {live && live.steps.length > 0 ? (
        <ul className={styles.steps} aria-label="Etapas da execução">
          {live.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      ) : null}
      {isActive(run) && !result ? (
        <p role="status" aria-live="polite" className={styles.loading}>
          <span className={styles.spinner} aria-hidden="true" />
          {live?.reconnecting
            ? "Processando — reconectando ao acompanhamento…"
            : "Processando"}
        </p>
      ) : null}
      {failed ? (
        <article
          className={[
            styles.bubble,
            styles.bubbleAgent,
            styles.bubbleError,
          ].join(" ")}
        >
          <div className={styles.bubbleHead}>
            <strong>Agent Atendimento</strong>
            <Badge tone="error">
              {run.status === "cancelled" ? "Cancelado" : "Falhou"}
            </Badge>
          </div>
          <p>Não foi possível gerar o rascunho.</p>
          <p className={styles.meta}>
            {FAILURE_DETAIL[run.error_code ?? ""] ??
              "A execução terminou com erro."}{" "}
            O pedido continua no histórico.
          </p>
          {canRetry ? (
            <div className={styles.row}>
              <Button
                variant="secondary"
                onClick={() => onRetry(run.input_content)}
              >
                Tentar novamente
              </Button>
            </div>
          ) : null}
        </article>
      ) : result && result.type === "draft" ? (
        <article
          className={[
            styles.bubble,
            styles.bubbleAgent,
            styles.bubbleDraft,
          ].join(" ")}
        >
          <div className={styles.bubbleHead}>
            <strong>Agent Atendimento</strong>
            <Badge tone="draft">Rascunho não enviado</Badge>
          </div>
          {/* Plain text only; no send or approval action exists here. */}
          <p>{result.content}</p>
        </article>
      ) : null}
    </div>
  );
}

export function AgentPanel({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const sessionEnded = useSessionEnded();
  const [session, setSession] = useState<AgentSession | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, LiveRun>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [contentError, setContentError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const following = useRef(new Map<string, AbortController>());
  // Runs whose live follow ended in an HTTP error. They are not followed
  // again automatically (that would loop while the run stays active); the
  // user resumes them explicitly with "Tentar novamente".
  const stalled = useRef(new Set<string>());
  // Key bound to one user intention (this exact content); reused on retry.
  const intention = useRef<{ content: string; key: string } | null>(null);
  const composerId = useId();
  const hintId = `${composerId}-hint`;
  const errorId = `${composerId}-error`;

  const loadSession = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const next = await api(
          `/api/agent-sessions/${sessionId}`,
          { signal },
          AgentSessionSchema,
        );
        setSession(next);
        setLoadError(null);
        return next;
      } catch (error) {
        if (signal?.aborted || sessionEnded(error)) return null;
        setLoadError(describeError(error));
        return null;
      }
    },
    [sessionId, sessionEnded],
  );

  useEffect(() => {
    const controller = new AbortController();
    const followed = following.current;
    api(
      `/api/agent-sessions/${sessionId}`,
      { signal: controller.signal },
      AgentSessionSchema,
    )
      .then(setSession)
      .catch((error: unknown) => {
        if (controller.signal.aborted || sessionEnded(error)) return;
        setLoadError(describeError(error));
      });
    return () => {
      controller.abort();
      // Leaving or switching sessions stops every live subscription.
      for (const subscription of followed.values()) subscription.abort();
      followed.clear();
    };
  }, [sessionId, sessionEnded]);

  useEffect(() => {
    if (!session?.lead_id) return;
    const controller = new AbortController();
    api(
      `/api/leads/${session.lead_id}`,
      { signal: controller.signal },
      LeadSchema,
    )
      .then(setLead)
      .catch(() => setLead(null));
    return () => controller.abort();
  }, [session?.lead_id]);

  const follow = useCallback(
    (runId: string) => {
      if (following.current.has(runId) || stalled.current.has(runId)) return;
      const controller = new AbortController();
      following.current.set(runId, controller);
      const patch = (update: (run: LiveRun) => LiveRun) =>
        setLive((current) => ({
          ...current,
          [runId]: update(current[runId] ?? { steps: [], reconnecting: false }),
        }));
      subscribeRun({
        sessionId,
        runId,
        signal: controller.signal,
        onEvent(event) {
          const step = stepOf(event);
          const output =
            event.type === "agent.output.created"
              ? AgentResultSchema.safeParse(event.data.result)
              : undefined;
          patch((run) => ({
            steps:
              step && !run.steps.includes(step)
                ? [...run.steps, step]
                : run.steps,
            output: output?.success ? output.data : run.output,
            reconnecting: false,
          }));
        },
        onConnectionChange(state) {
          patch((run) => ({ ...run, reconnecting: state === "reconnecting" }));
        },
        onExpired() {
          setNotice("Eventos em tempo real expiraram. Histórico recuperado.");
        },
        onUnauthorized() {
          controller.abort();
          router.replace("/login?motivo=sessao");
        },
      })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          stalled.current.add(runId);
          setStreamError(
            error instanceof SseHttpError
              ? "Não foi possível acompanhar a execução em tempo real. O estado abaixo vem do histórico salvo."
              : describeError(error),
          );
        })
        .finally(() => {
          following.current.delete(runId);
          if (controller.signal.aborted) return;
          // The persisted session is authoritative after terminal, 410 or error.
          void loadSession();
        });
    },
    [sessionId, loadSession, router],
  );

  useEffect(() => {
    for (const run of session?.runs ?? [])
      if (isActive(run)) follow(run.run_id);
  }, [session, follow]);

  async function resumeFollowing() {
    setStreamError(null);
    stalled.current.clear();
    const next = await loadSession();
    for (const run of next?.runs ?? []) if (isActive(run)) follow(run.run_id);
  }

  async function send(text: string) {
    if (!text.trim()) {
      setContentError("Escreva uma mensagem para o Agent.");
      return;
    }
    setContentError(null);
    setSendError(null);
    if (intention.current?.content !== text)
      intention.current = { content: text, key: newIdempotencyKey() };
    const { key } = intention.current;
    setSending(true);
    try {
      const accepted = await postIdempotent(
        `/api/agent-sessions/${sessionId}/messages`,
        { content: text },
        AgentRunAcceptedSchema,
        key,
      );
      intention.current = null;
      setContent((current) => (current === text ? "" : current));
      await loadSession();
      follow(accepted.run_id);
    } catch (error) {
      if (sessionEnded(error)) return;
      // The text stays in the composer; resending it reuses the same key.
      setSendError(describeError(error));
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(content);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    if (!sending) void send(content);
  }

  if (loadError && !session)
    return (
      <div className={styles.stack}>
        <Alert>{loadError}</Alert>
        <div>
          <Button variant="secondary" onClick={() => void loadSession()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  if (!session) return <Loading>Carregando sessão do Agent…</Loading>;

  const lastFailed = [...session.runs]
    .reverse()
    .find((run) => run.status === "failed" || run.status === "cancelled");
  const latestRun = session.runs[session.runs.length - 1];

  return (
    <div className={styles.agentLayout}>
      <section className={styles.chat} aria-labelledby="session-title">
        <header className={styles.chatHeader}>
          <span className={styles.agentAvatar} aria-hidden="true">
            A
          </span>
          <div>
            <h1 id="session-title" className={styles.sessionTitle}>
              {session.title}
            </h1>
            <span className={styles.meta}>
              Agent Atendimento · sessão iniciada em{" "}
              {formatDateTime(session.created_at)}
            </span>
          </div>
          <Badge tone="agent">Simulado</Badge>
        </header>
        <div
          className={styles.history}
          role="log"
          aria-live="polite"
          aria-label="Histórico da sessão"
        >
          {notice ? <Alert tone="info">{notice}</Alert> : null}
          {streamError ? (
            <div className={styles.stack}>
              <Alert>{streamError}</Alert>
              <div>
                <Button variant="secondary" onClick={resumeFollowing}>
                  Tentar novamente
                </Button>
              </div>
            </div>
          ) : null}
          {session.runs.length === 0 ? (
            <p className={styles.meta}>
              Nenhum pedido ainda. Descreva o que o Agent deve preparar; o
              resultado é um rascunho que não é enviado ao lead.
            </p>
          ) : (
            session.runs.map((run) => (
              <RunView
                key={run.run_id}
                run={run}
                live={live[run.run_id]}
                canRetry={run === lastFailed && run === latestRun && !sending}
                onRetry={(text) => {
                  intention.current = null; // a retry is a new intention
                  void send(text);
                }}
              />
            ))
          )}
        </div>
        <form className={styles.composer} onSubmit={submit} noValidate>
          {sendError ? <Alert>{sendError}</Alert> : null}
          <label className={styles.label} htmlFor={composerId}>
            Mensagem para o Agent
          </label>
          <div className={styles.composerRow}>
            <textarea
              id={composerId}
              className={styles.input}
              value={content}
              maxLength={12000}
              rows={3}
              aria-invalid={contentError ? true : undefined}
              aria-describedby={contentError ? `${errorId} ${hintId}` : hintId}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <Button type="submit" busy={sending}>
              Gerar rascunho
            </Button>
          </div>
          {contentError ? (
            <span id={errorId} className={styles.fieldError}>
              {contentError}
            </span>
          ) : null}
          <span id={hintId} className={styles.hint}>
            Enter gera o rascunho; Shift+Enter quebra a linha.
          </span>
        </form>
      </section>
      <aside className={styles.contextPanel} aria-label="Contexto do Agent">
        <Card labelledBy="context-title">
          <div className={styles.cardHeader}>
            <h2 id="context-title">Contexto</h2>
          </div>
          <dl className={styles.definitionList}>
            <dt>Lead</dt>
            <dd>
              {session.lead_id ? (
                <Link href={`/leads?lead=${session.lead_id}`}>
                  {lead?.name ?? "Abrir ficha"}
                </Link>
              ) : (
                "Sem lead"
              )}
            </dd>
            <dt>Conversa</dt>
            <dd>
              {session.conversation_id ? (
                <Link href={`/conversations/${session.conversation_id}`}>
                  Voltar para a conversa
                </Link>
              ) : (
                "Sem conversa"
              )}
            </dd>
            <dt>Capacidades</dt>
            <dd>Ler lead, ler conversa e preparar rascunho</dd>
          </dl>
        </Card>
        <Card labelledBy="policy-title">
          <h2 id="policy-title">O Agent apenas orienta</h2>
          <p className={styles.meta}>
            Os rascunhos ficam salvos na conversa e não são enviados ao lead.
            Envio e aprovação chegam em um ciclo posterior.
          </p>
        </Card>
      </aside>
    </div>
  );
}
