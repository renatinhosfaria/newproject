"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SessionUserSchema, type SessionUser } from "@pacaembu/contracts";
import { api, describeError, isUnauthorized } from "../lib/api";
import {
  Alert,
  Button,
  Card,
  Loading,
  PageHeader,
  ROLE_LABEL,
  styles,
} from "./ui";

const SessionContext = createContext<SessionUser | null>(null);

export function useSessionUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error("useSessionUser outside AppShell");
  return user;
}

/** Returns a handler that sends the user to login when the session ended. */
export function useSessionEnded(): (error: unknown) => boolean {
  const router = useRouter();
  return useCallback(
    (error: unknown) => {
      if (!isUnauthorized(error)) return false;
      router.replace("/login?motivo=sessao");
      return true;
    },
    [router],
  );
}

export function AppShell({
  title,
  children,
}: {
  title: string;
  children: (user: SessionUser) => ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api("/api/auth/me", { signal: controller.signal }, SessionUserSchema)
      .then(setUser)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        // First load without a session: plain redirect, nothing expired.
        if (isUnauthorized(cause)) router.replace("/login");
        else setError(describeError(cause));
      });
    return () => controller.abort();
  }, [router, attempt]);

  useEffect(() => {
    if (!menuOpen) return;
    // The drawer precedes the top bar in DOM order: move focus into it.
    sidebar.current?.querySelector<HTMLElement>("a[href]")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  async function logout() {
    setLeaving(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // Session already gone or unreachable: the cookie is HttpOnly and
      // cannot be cleared here, so the login screen is still the safe place.
    }
    router.replace("/login");
  }

  if (error)
    return (
      <main className={styles.content}>
        <div className={styles.stack}>
          <Alert>{error}</Alert>
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            >
              Tentar novamente
            </Button>
          </div>
        </div>
      </main>
    );
  if (!user)
    return (
      <main className={styles.content}>
        <Loading>Carregando sua sessão…</Loading>
      </main>
    );

  const isBroker = user.role === "broker";
  return (
    <SessionContext.Provider value={user}>
      <div className={styles.shell}>
        {menuOpen ? (
          <div
            className={styles.backdrop}
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <aside
          ref={sidebar}
          id="app-sidebar"
          className={[styles.sidebar, menuOpen ? styles.sidebarOpen : ""].join(
            " ",
          )}
        >
          <div className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true" />
            Orbit CRM
          </div>
          <nav aria-label="Principal">
            <div className={styles.navGroupLabel}>Workspace</div>
            <ul className={styles.navList}>
              {isBroker ? (
                <li>
                  <Link
                    href="/leads"
                    className={styles.navLink}
                    aria-current={
                      pathname.startsWith("/leads") ? "page" : undefined
                    }
                    onClick={() => setMenuOpen(false)}
                  >
                    Leads
                  </Link>
                </li>
              ) : (
                <li>
                  <Link
                    href="/"
                    className={styles.navLink}
                    aria-current={pathname === "/" ? "page" : undefined}
                    onClick={() => setMenuOpen(false)}
                  >
                    Visão do supervisor
                  </Link>
                </li>
              )}
            </ul>
          </nav>
          <p className={styles.navNote}>
            Agents abrem a partir de uma conversa. Gestão, performance e imóveis
            chegam nos próximos ciclos.
          </p>
          <div className={styles.sidebarFooter}>
            <strong>{user.name}</strong>
            <span>
              {ROLE_LABEL[user.role]} · {user.workspace_name}
            </span>
          </div>
        </aside>
        <div className={styles.main}>
          <header className={styles.topbar}>
            <Button
              ref={menuButton}
              variant="secondary"
              className={styles.menuButton}
              aria-expanded={menuOpen}
              aria-controls="app-sidebar"
              onClick={() => setMenuOpen((open) => !open)}
            >
              Menu
            </Button>
            <div className={styles.topbarTitle}>{title}</div>
            <div className={styles.identity}>
              <div className={styles.identityText}>
                <span>
                  <strong>{user.name}</strong> · {ROLE_LABEL[user.role]}
                </span>
                <span>{user.workspace_name}</span>
              </div>
              <Button variant="secondary" busy={leaving} onClick={logout}>
                Sair
              </Button>
            </div>
          </header>
          <main className={styles.content}>{children(user)}</main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}

/** Supervisors have identity and context only in this cycle. */
export function SupervisorOverview({ user }: { user: SessionUser }) {
  return (
    <>
      <PageHeader
        eyebrow="Contexto da sessão"
        title="Visão do supervisor"
        description="Você está conectado com uma membership de supervisão."
      />
      <div className={styles.supervisorGrid}>
        <Card labelledBy="supervisor-identity">
          <div className={styles.cardHeader}>
            <h2 id="supervisor-identity">Sua identidade</h2>
          </div>
          <dl className={styles.definitionList}>
            <dt>Nome</dt>
            <dd>{user.name}</dd>
            <dt>E-mail</dt>
            <dd>{user.email}</dd>
            <dt>Papel</dt>
            <dd>{ROLE_LABEL[user.role]}</dd>
            <dt>Workspace</dt>
            <dd>{user.workspace_name}</dd>
          </dl>
        </Card>
        <Card labelledBy="supervisor-modules">
          <div className={styles.cardHeader}>
            <h2 id="supervisor-modules">Módulos indisponíveis neste ciclo</h2>
          </div>
          <div className={styles.stack}>
            <p>
              Carteira, conversas e Agents exigem uma membership de corretor
              neste ciclo preparatório. Esta conta não acessa dados de
              corretores.
            </p>
            <p>
              A visão de equipe, os indicadores e a gestão de corretores serão
              liberados quando a política de supervisão for implementada.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
