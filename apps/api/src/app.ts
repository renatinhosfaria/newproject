import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import type { Clock } from "./clock.js";
import { ProblemFilter } from "./http/problem.filter.js";
import { RequestIdInterceptor } from "./http/request-id.js";
import { SystemClock } from "./clock.js";
import { CsrfInterceptor } from "./auth/csrf.js";

import type { AgentDependencies } from "./agents/agents.module.js";

export interface ApiConfig {
  nodeEnv?: string;
  allowedOrigin?: string;
  databaseUrl?: string;
}

export async function createApp(
  config: ApiConfig,
  deps: AgentDependencies & {
    clock?: Clock;
    logStream?: { write(message: string): void };
  } = {},
): Promise<NestFastifyApplication> {
  const resolved = {
    nodeEnv: config.nodeEnv ?? process.env.NODE_ENV ?? "development",
    allowedOrigin:
      config.allowedOrigin ?? process.env.APP_ORIGIN ?? "http://localhost:3000",
    databaseUrl: config.databaseUrl ?? process.env.DATABASE_URL,
  };
  const adapter = new FastifyAdapter({
    trustProxy: false,
    logger: {
      level: deps.logStream
        ? "info"
        : resolved.nodeEnv === "test"
          ? "silent"
          : "info",
      stream: deps.logStream,
      redact: {
        paths: [
          "cookie",
          "password",
          "token",
          "headers.cookie",
          "headers.authorization",
          "req.headers.cookie",
          "req.headers.authorization",
          "body.password",
          "body.token",
          "req.body.password",
          "req.body.token",
          'res.headers["set-cookie"]',
        ],
        censor: "[REDACTED]",
      },
    },
  });
  adapter.getInstance().addHook("onRequest", async (request, reply) => {
    if (request.url.split("?")[0].startsWith("/api/auth/"))
      reply.header("cache-control", "no-store");
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(resolved, deps.clock ?? new SystemClock(), deps),
    adapter,
    { logger: false },
  );
  app.useGlobalInterceptors(
    new RequestIdInterceptor(),
    new CsrfInterceptor(resolved.allowedOrigin),
  );
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  await app.init();
  return app;
}
