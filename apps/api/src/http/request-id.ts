import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      id?: string;
      headers?: Record<string, string | undefined>;
    }>();
    const response = context
      .switchToHttp()
      .getResponse<{ header: (name: string, value: string) => void }>();
    const incoming = request.headers?.["x-request-id"];
    request.id = incoming && incoming.length <= 160 ? incoming : randomUUID();
    response.header("x-request-id", request.id);
    return next.handle().pipe(tap(() => undefined));
  }
}
