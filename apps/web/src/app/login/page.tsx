"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState, type FormEvent } from "react";
import {
  SessionUserSchema,
  WorkspaceContextProblemSchema,
  type WorkspaceOption,
} from "@pacaembu/contracts";
import { ApiError, api, describeError } from "../../lib/api";
import { Alert, Button, TextField, styles } from "../../components/ui";

interface Errors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): Errors {
  const errors: Errors = {};
  if (!email.trim()) errors.email = "Informe o e-mail.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    errors.email = "Informe um e-mail válido.";
  if (!password) errors.password = "Informe a senha.";
  else if (password.length < 8)
    errors.password = "A senha tem pelo menos 8 caracteres.";
  return errors;
}

function loginMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return describeError(error);
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      return "E-mail ou senha inválidos.";
    case "NO_ACTIVE_MEMBERSHIP":
    case "WORKSPACE_ACCESS_DENIED":
    case "BROKER_CONTEXT_REQUIRED":
      return "Sua conta não tem acesso ativo a este workspace. Fale com o supervisor.";
    case "RATE_LIMITED":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "VALIDATION_ERROR":
      return "Verifique o e-mail e a senha informados.";
    default:
      return describeError(error);
  }
}

function LoginForm() {
  const router = useRouter();
  const reason = useSearchParams().get("motivo");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[] | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function login(chosenWorkspace?: string) {
    setBusy(true);
    setFailure(null);
    try {
      const user = await api(
        "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: email.trim(),
            password,
            ...(chosenWorkspace ? { workspace_id: chosenWorkspace } : {}),
          }),
        },
        SessionUserSchema,
      );
      setPassword("");
      router.replace(user.role === "broker" ? "/leads" : "/");
    } catch (error) {
      const choice =
        error instanceof ApiError && error.status === 409
          ? WorkspaceContextProblemSchema.safeParse(error.problem)
          : undefined;
      if (choice?.success) {
        // Credentials were accepted; the user must pick the context.
        setWorkspaces(choice.data.options);
        setWorkspaceId("");
      } else {
        setFailure(loginMessage(error));
      }
      setBusy(false);
    }
  }

  function submitCredentials(event: FormEvent) {
    event.preventDefault();
    const found = validate(email, password);
    setErrors(found);
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    void login();
  }

  function submitWorkspace(event: FormEvent) {
    event.preventDefault();
    if (!workspaceId) {
      setFailure("Escolha um workspace para continuar.");
      return;
    }
    void login(workspaceId);
  }

  return (
    <main className={styles.authLayout}>
      <section className={styles.authPanel} aria-labelledby="login-title">
        <div className={styles.authBrand}>
          <span className={styles.brandMark} aria-hidden="true" />
          Orbit CRM
        </div>
        <h1 id="login-title">Entrar</h1>
        <p>Acesse sua carteira e o Agent de Atendimento simulado.</p>
        {reason === "sessao" && !failure ? (
          <Alert tone="info">Sua sessão terminou. Entre novamente.</Alert>
        ) : null}
        {failure ? <Alert>{failure}</Alert> : null}
        {workspaces ? (
          <form className={styles.form} onSubmit={submitWorkspace} noValidate>
            <fieldset className={styles.fieldset}>
              <legend>Escolha o workspace</legend>
              {workspaces.map((option) => (
                <label key={option.workspace_id} className={styles.choice}>
                  <input
                    type="radio"
                    name="workspace"
                    value={option.workspace_id}
                    checked={workspaceId === option.workspace_id}
                    onChange={() => setWorkspaceId(option.workspace_id)}
                  />
                  {option.name}
                </label>
              ))}
            </fieldset>
            <div className={styles.row}>
              <Button type="submit" busy={busy}>
                Continuar
              </Button>
              <Button
                variant="tertiary"
                onClick={() => {
                  setWorkspaces(null);
                  setPassword("");
                  setFailure(null);
                }}
              >
                Usar outra conta
              </Button>
            </div>
          </form>
        ) : (
          <form className={styles.form} onSubmit={submitCredentials} noValidate>
            <TextField
              ref={emailRef}
              label="E-mail"
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              error={errors.email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <TextField
              ref={passwordRef}
              label="Senha"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              error={errors.password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" busy={busy}>
              Entrar
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
