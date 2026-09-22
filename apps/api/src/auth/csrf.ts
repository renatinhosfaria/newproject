import { problem } from "../http/problem.filter.js";
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { Observable } from "rxjs";

export function assertBrowserOrigin(
  headers: Record<string, string | undefined>,
  allowed: string,
): void {
  const origin = headers.origin;
  const candidate = origin !== undefined ? origin : headers.referer;
  if (!candidate) throw problem(403, "CSRF_ORIGIN_REQUIRED");
  if (candidate === "null") throw problem(403, "CSRF_ORIGIN_INVALID");
  try {
    if (new URL(candidate).origin === new URL(allowed).origin) return;
  } catch {
    // Uniform public error below.
  }
  throw problem(403, "CSRF_ORIGIN_INVALID");
}

@Injectable()
export class CsrfInterceptor implements NestInterceptor {
  constructor(private readonly allowedOrigin: string) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: Record<string, string | undefined>;
    }>();
    if (["POST", "PATCH", "DELETE"].includes(request.method)) {
      assertBrowserOrigin(request.headers, this.allowedOrigin);
    }
    return next.handle();
  }
}
