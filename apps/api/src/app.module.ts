import type { ApiConfig } from "./app.js";
import type { Clock } from "./clock.js";
import { Module } from "@nestjs/common";
import { CLOCK, HealthController } from "./http/health.controller.js";
import {
  AgentsModule,
  type AgentDependencies,
} from "./agents/agents.module.js";
import type { DynamicModule } from "@nestjs/common";

@Module({
  imports: [],
  controllers: [HealthController],
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
      controllers: [HealthController],
      providers: [{ provide: CLOCK, useValue: clock }],
    };
  }
}
