// Same-origin JSON client. The session lives only in the HttpOnly cookie set by
// the API; nothing here reads, stores or forwards a token. Every consumer
// validates the response body with the shared Zod schema it expects.
import { ProblemSchema, type Problem } from "@pacaembu/contracts";
import type { ZodType, ZodTypeDef } from "zod";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly problem: (Problem & Record<string, unknown>) | undefined,
  ) {
    super(`${status} ${code}`);
    this.name = "ApiError";
  }
}

/** The request may or may not have reached the server. */
export class NetworkError extends Error {
  constructor() {
    super("network");
    this.name = "NetworkError";
  }
}

/** Response arrived but does not match the contract. */
export class ContractError extends Error {
  constructor() {
    super("contract");
    this.name = "ContractError";
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  schema?: ZodType<T, ZodTypeDef, unknown>,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new NetworkError();
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    const problem = ProblemSchema.passthrough().safeParse(body);
    throw new ApiError(
      response.status,
      problem.success ? problem.data.code : "HTTP_ERROR",
      problem.success
        ? (problem.data as Problem & Record<string, unknown>)
        : undefined,
    );
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => undefined);
  if (!schema) return body as T;
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ContractError();
  return parsed.data;
}

export function newIdempotencyKey(): string {
  // getRandomValues works outside secure contexts too (randomUUID does not).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const RETRY_DELAYS_MS = [1000, 2000, 4000];

/**
 * POST with an Idempotency-Key created once for this user intention. Only a
 * network failure (unknown outcome) is retried, always with the same key, so
 * the API replays the original result instead of creating a second effect.
 */
export async function postIdempotent<T>(
  path: string,
  body: unknown,
  schema: ZodType<T, ZodTypeDef, unknown>,
  key: string,
  onRetry?: (attempt: number) => void,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await api(
        path,
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Idempotency-Key": key },
        },
        schema,
      );
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (!(error instanceof NetworkError) || delay === undefined) throw error;
      onRetry?.(attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** Portuguese message for a failed call; never exposes internal details. */
export function describeError(error: unknown): string {
  if (error instanceof NetworkError)
    return "Não foi possível falar com o servidor. Verifique a conexão e tente novamente.";
  if (error instanceof ContractError)
    return "O servidor respondeu em um formato inesperado. Recarregue a página.";
  if (!(error instanceof ApiError)) return "Algo deu errado. Tente novamente.";
  switch (error.code) {
    case "CSRF_ORIGIN_REQUIRED":
    case "CSRF_ORIGIN_INVALID":
      return "A solicitação foi bloqueada por segurança. Recarregue a página e tente novamente.";
    case "VALIDATION_ERROR":
      return "Alguns dados não foram aceitos. Revise os campos e tente novamente.";
    case "RESOURCE_NOT_FOUND":
      return "Registro não encontrado na sua carteira.";
    case "IDEMPOTENCY_KEY_REUSED":
      return "Esta ação já foi registrada com outros dados. Recarregue a página.";
    case "AGENT_UNAVAILABLE":
      return "O Agent não está disponível para este workspace.";
    case "AGENT_SESSION_INACTIVE":
      return "Esta sessão do Agent não está mais ativa.";
    case "RATE_LIMITED":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    default:
      return error.status >= 500
        ? "O servidor não conseguiu concluir a ação. Tente novamente em instantes."
        : "Não foi possível concluir a ação.";
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
