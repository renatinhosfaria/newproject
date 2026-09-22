import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { AuthService } from "./auth.service.js";

export interface AuthenticatedRequest {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, string>;
  user?: import("@pacaembu/contracts").SessionUser;
  sessionToken?: string;
  id?: string;
  ip?: string;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie);
    request.user = await this.auth.resolveSession(token ?? "");
    request.sessionToken = token;
    return true;
  }
}

export function readCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  for (const item of header.split(";")) {
    const [key, ...rest] = item.trim().split("=");
    if (key === "crm_session") return rest.join("=");
  }
  return undefined;
}
