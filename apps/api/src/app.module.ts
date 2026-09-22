import type { ApiConfig } from "./app.js";
import type { Clock } from "./clock.js";
import { Module } from "@nestjs/common";
import {
  CLOCK,
  HEALTH_DATABASE_URL,
  HealthController,
  LegacyHealthController,
} from "./http/health.controller.js";
import {
  AgentsModule,
  type AgentDependencies,
} from "./agents/agents.module.js";
import type { DynamicModule } from "@nestjs/common";

@Module({
  imports: [],
  controllers: [HealthController, LegacyHealthController],
})
export class AppModule {
  static forRoot(
    config: ApiConfig,
    clock: Clock,
    deps: AgentDependencies = {},
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [AgentsModule.forRoot(config, clock, deps)],
      controllers: [HealthController, LegacyHealthController],
      providers: [
        { provide: CLOCK, useValue: clock },
        { provide: HEALTH_DATABASE_URL, useValue: config.databaseUrl },
      ],
    };
  }
}
