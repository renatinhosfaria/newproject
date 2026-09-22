"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ConversationPageSchema,
  ConversationSchema,
  LeadPageSchema,
  LeadSchema,
  type Conversation,
  type Lead,
} from "@pacaembu/contracts";
import {
  AppShell,
  SupervisorOverview,
  useSessionEnded,
} from "../../components/app-shell";
import { LeadForm, STAGE_LABEL } from "../../components/lead-form";
import {
  api,
  describeError,
  newIdempotencyKey,
  postIdempotent,
} from "../../lib/api";
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
} from "../../components/ui";

type Load<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

function LeadRecord({
  leadId,
  onChanged,
}: {
  leadId: string;
  onChanged(): void;
}) {
  const router = useRouter();
  const sessionEnded = useSessionEnded();
  const [lead, setLead] = useState<Load<Lead>>({ state: "loading" });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // One key per "open conversation" intention, reused on network retries.
  const openKey = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(`/api/leads/${leadId}`, { signal: controller.signal }, LeadSchema),
      api(
        "/api/conversations?page_size=100",
        { signal: controller.signal },
        ConversationPageSchema,
      ),
    ])
      .then(([data, page]) => {
        setLead({ state: "ready", data });
        setConversations(page.items.filter((c) => c.lead_id === leadId));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || sessionEnded(error)) return;
        setLead({ state: "error", message: describeError(error) });
      });
    return () => controller.abort();
  }, [leadId, reload, sessionEnded]);

  async function openConversation(target: Lead) {
    openKey.current ??= newIdempotencyKey();
    setOpening(true);
    setFailure(null);
    try {
      const conversation = await postIdempotent(
        "/api/conversations",
        { lead_id: target.id },
        ConversationSchema,
        openKey.current,
      );
      openKey.current = null;
      router.push(`/conversations/${conversation.id}`);
    } catch (error) {
      setOpening(false);
      if (sessionEnded(error)) return;
      setFailure(describeError(error));
    }
  }

  if (lead.state === "loading") return <Loading>Carregando ficha…</Loading>;
  if (lead.state === "error")
    return (
      <div className={styles.stack}>
        <Alert>{lead.message}</Alert>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setLead({ state: "loading" });
              setReload((n) => n + 1);
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  const data = lead.data;
  return (
    <Card labelledBy="lead-title">
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.eyebrow}>Ficha do lead</span>
          <h2 id="lead-title">{data.name}</h2>
        </div>
        <Badge>{STAGE_LABEL[data.stage]}</Badge>
      </div>
      {notice ? <Alert tone="info">{notice}</Alert> : null}
      {editing ? (
        <LeadForm
          lead={data}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setLead({ state: "ready", data: saved });
            setEditing(false);
            setNotice("Alterações salvas.");
            onChanged();
          }}
        />
      ) : (
        <div className={styles.stack}>
          <dl className={styles.definitionList}>
            <dt>Telefone</dt>
            <dd>{data.phone ?? "Não informado"}</dd>
            <dt>E-mail</dt>
            <dd>{data.email ?? "Não informado"}</dd>
            <dt>Origem</dt>
            <dd>{data.source ?? "Não informada"}</dd>
            <dt>Interesse</dt>
            <dd>{data.interest ?? "Não informado"}</dd>
            <dt>Próximo passo</dt>
            <dd>{data.next_action ?? "Não definido"}</dd>
          </dl>
          {failure ? <Alert>{failure}</Alert> : null}
          <div className={styles.row}>
            <Button busy={opening} onClick={() => openConversation(data)}>
              Abrir conversa
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setNotice(null);
                setEditing(true);
              }}
            >
              Editar lead
            </Button>
          </div>
          <section aria-labelledby="lead-conversations">
            <h3 id="lead-conversations">Conversas deste lead</h3>
            {conversations.length === 0 ? (
              <p className={styles.meta}>Nenhuma conversa aberta ainda.</p>
            ) : (
              <ul className={styles.list}>
                {conversations.map((conversation) => (
                  <li key={conversation.id} className={styles.listItem}>
                    <Link href={`/conversations/${conversation.id}`}>
                      Conversa de {formatDateTime(conversation.created_at)}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Card>
  );
}

function BrokerLeads() {
  const router = useRouter();
  const selected = useSearchParams().get("lead");
  const sessionEnded = useSessionEnded();
  const [leads, setLeads] = useState<Load<{ items: Lead[]; total: number }>>({
    state: "loading",
  });
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      api("/api/leads?page_size=100", { signal }, LeadPageSchema)
        .then((page) =>
          setLeads({
            state: "ready",
            data: { items: page.items, total: page.page.total },
          }),
        )
        .catch((error: unknown) => {
          if (signal?.aborted || sessionEnded(error)) return;
          setLeads({ state: "error", message: describeError(error) });
        });
    },
    [sessionEnded],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, selected]);

  return (
    <>
      <PageHeader
        eyebrow="Carteira"
        title="Leads"
        description={
          leads.state === "ready"
            ? `${leads.data.total} ${leads.data.total === 1 ? "lead" : "leads"} na sua carteira`
            : "Sua carteira de leads"
        }
        actions={
          creating ? null : (
            <Button
              onClick={() => {
                setNotice(null);
                setCreating(true);
              }}
            >
              Novo lead
            </Button>
          )
        }
      />
      <div className={styles.stack}>
        {notice ? <Alert tone="info">{notice}</Alert> : null}
        {creating ? (
          <Card labelledBy="new-lead-title">
            <div className={styles.cardHeader}>
              <h2 id="new-lead-title">Novo lead</h2>
            </div>
            <LeadForm
              onCancel={() => setCreating(false)}
              onSaved={(lead) => {
                setCreating(false);
                setNotice(`Lead ${lead.name} salvo.`);
                load();
              }}
            />
          </Card>
        ) : null}
        <div className={styles.grid2}>
          <Card labelledBy="portfolio-title">
            <div className={styles.cardHeader}>
              <h2 id="portfolio-title">Carteira</h2>
            </div>
            {leads.state === "loading" ? (
              <Loading>Carregando leads…</Loading>
            ) : leads.state === "error" ? (
              <div className={styles.stack}>
                <Alert>{leads.message}</Alert>
                <div>
                  <Button variant="secondary" onClick={() => load()}>
                    Tentar novamente
                  </Button>
                </div>
              </div>
            ) : leads.data.items.length === 0 ? (
              <EmptyState title="Nenhum lead na sua carteira ainda">
                <p>Use “Novo lead” para cadastrar o primeiro contato.</p>
              </EmptyState>
            ) : (
              <ul className={styles.list}>
                {leads.data.items.map((lead) => (
                  <li
                    key={lead.id}
                    className={[
                      styles.listItem,
                      lead.id === selected ? styles.listItemActive : "",
                    ].join(" ")}
                  >
                    <Link
                      href={`/leads?lead=${lead.id}`}
                      aria-current={lead.id === selected ? "true" : undefined}
                    >
                      {lead.name}
                    </Link>
                    <Badge>{STAGE_LABEL[lead.stage]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {selected ? (
            <LeadRecord
              key={selected}
              leadId={selected}
              onChanged={() => load()}
            />
          ) : leads.state === "ready" && leads.data.items.length > 0 ? (
            <Card className={styles.desktopOnly}>
              <EmptyState title="Selecione um lead">
                <p>A ficha, a edição e as conversas aparecem aqui.</p>
              </EmptyState>
              <Button
                variant="tertiary"
                onClick={() =>
                  router.push(`/leads?lead=${leads.data.items[0].id}`)
                }
              >
                Abrir o lead mais recente
              </Button>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

export default function LeadsPage() {
  return (
    <AppShell title="Leads">
      {(user) =>
        user.role === "broker" ? (
          <Suspense fallback={<Loading />}>
            <BrokerLeads />
          </Suspense>
        ) : (
          <SupervisorOverview user={user} />
        )
      }
    </AppShell>
  );
}
