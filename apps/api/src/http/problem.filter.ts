import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { Catch } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  request_id: string;
  retryable: boolean;
  options?: Array<{ workspace_id: string; name: string }>;
}

export class ProblemError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly retryable: boolean;
  requestId?: string;
  options?: Array<{ workspace_id: string; name: string }>;

  constructor(
    status: number,
    code: string,
    detail?: string,
    retryable = false,
  ) {
    super(code);
    this.name = "ProblemError";
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
  }
}

export function problem(
  status: number,
  code: string,
  detail?: string,
  retryable = false,
): ProblemError {
  return new ProblemError(status, code, detail, retryable);
}

export function requestIdOf(request: {
  id?: string;
  headers?: Record<string, unknown>;
}): string {
  const id = request.id ?? request.headers?.["x-request-id"];
  return typeof id === "string" && id.length > 0 ? id : randomUUID();
}

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (n: number) => unknown;
      header: (k: string, v: string) => unknown;
      send: (body: unknown) => unknown;
    }>();
    const request = host
      .switchToHttp()
      .getRequest<{ id?: string; headers?: Record<string, unknown> }>();
    const requestId = requestIdOf(request);
    const validation = isZodError(exception);
    const error =
      exception instanceof ProblemError
        ? exception
        : validation
          ? problem(422, "VALIDATION_ERROR")
          : undefined;
    const status = error?.status ?? 500;
    const body: ProblemBody = {
      type: "about:blank",
      title: error?.code ?? "INTERNAL_ERROR",
      status,
      code: error?.code ?? "INTERNAL_ERROR",
      ...(error?.detail ? { detail: error.detail } : {}),
      request_id: error?.requestId ?? requestId,
      retryable: error?.retryable ?? false,
      ...(error?.options ? { options: error.options } : {}),
    };
    response.status(status);
    const retryAfter =
      exception instanceof ProblemError
        ? (exception as ProblemError & { retryAfter?: number }).retryAfter
        : undefined;
    if (retryAfter) response.header("retry-after", String(retryAfter));
    response.header("content-type", "application/problem+json");
    response.header("x-request-id", body.request_id);
    response.send(body);
  }
}

function isZodError(value: unknown): boolean {
  return (
    !!value &&
    typeof value === "object" &&
    "name" in value &&
    value.name === "ZodError"
  );
}
