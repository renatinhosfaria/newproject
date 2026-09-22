import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  Inject,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { LoginRequestSchema, type LoginRequest } from "@pacaembu/contracts";
import type { AuthenticatedRequest } from "./session.guard.js";
import { SessionGuard } from "./session.guard.js";
import { AuthService } from "./auth.service.js";
import { LoginRateLimiter } from "./rate-limit.js";
import { requestIdOf } from "../http/problem.filter.js";

const COOKIE = "crm_session";
const TTL_SECONDS = 8 * 60 * 60;

@Controller("api/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(LoginRateLimiter) private readonly limiter: LoginRateLimiter,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Headers() headers: Record<string, string | undefined>,
    @Req() req: AuthenticatedRequest,
    @Res() reply: FastifyReply,
  ) {
    const input = LoginRequestSchema.parse(body) as LoginRequest;
    const ip =
      headers["x-forwarded-for"]?.split(",")[0]?.trim() ??
      headers["x-real-ip"] ??
      "unknown";
    // Keep the limiter key identical to the canonical login identity.
    this.limiter.check(ip, input.email.trim().toLowerCase());
    const result = await this.auth.login(input, requestIdOf(req));
    reply.header("cache-control", "no-store");
    reply.header("set-cookie", cookieHeader(result.token));
    return reply.send(result.user);
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @Headers() headers: Record<string, string | undefined>,
    @Req() req: AuthenticatedRequest,
    @Res() reply: FastifyReply,
  ) {
    await this.auth.logout(req.sessionToken ?? "", requestIdOf(req));
    reply.header("cache-control", "no-store");
    reply.header("set-cookie", expireCookie());
    return reply.send();
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() req: AuthenticatedRequest) {
    return req.user;
  }
}

function cookieHeader(token: string): string {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SECONDS}${secureSuffix()}`;
}

function expireCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureSuffix()}`;
}

function secureSuffix(): string {
  return ["local", "development", "test"].includes(
    process.env.NODE_ENV ?? "development",
  )
    ? ""
    : "; Secure";
}
