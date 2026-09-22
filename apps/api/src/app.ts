import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import type { Clock } from "./clock.js";
import { CLOCK } from "./http/health.controller.js";
import { ProblemFilter } from "./http/problem.filter.js";
import { RequestIdInterceptor } from "./http/request-id.js";
import { CsrfInterceptor } from "./auth/csrf.js";

export interface ApiConfig {
  nodeEnv?: string;
  allowedOrigin?: string;
  databaseUrl?: string;
}

export async function createApp(
  config: ApiConfig,
  deps: { clock?: Clock } = {},
): Promise<NestFastifyApplication> {
  if (config.nodeEnv) process.env.NODE_ENV = config.nodeEnv;
  if (config.allowedOrigin) process.env.APP_ORIGIN = config.allowedOrigin;
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(config.databaseUrl),
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  if (deps.clock)
    Object.assign(app.get<Clock>(CLOCK), {
      now: deps.clock.now.bind(deps.clock),
    });
  app.useGlobalInterceptors(new RequestIdInterceptor(), new CsrfInterceptor());
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
  await app.init();
  return app;
}
