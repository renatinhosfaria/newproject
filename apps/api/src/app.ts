import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import type { Clock } from "./clock.js";
import { CLOCK } from "./http/health.controller.js";

export interface ApiConfig {
  nodeEnv?: string;
  allowedOrigin?: string;
}

export async function createApp(
  config: ApiConfig,
  deps: { clock?: Clock } = {},
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );
  if (deps.clock)
    Object.assign(app.get<Clock>(CLOCK), {
      now: deps.clock.now.bind(deps.clock),
    });
  app.enableShutdownHooks();
  await app.init();
  return app;
}
