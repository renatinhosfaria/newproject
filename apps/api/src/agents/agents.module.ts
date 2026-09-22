import { Module, type DynamicModule } from "@nestjs/common";
import type { ApiConfig } from "../app.js";
import type { Clock } from "../clock.js";
import { CrmModule } from "../crm/crm.module.js";
import { AuditService } from "../audit/audit.service.js";
import { AgentsService } from "./agents.service.js";
import { AgentsController } from "./agents.controller.js";
import { RunExecutor } from "./run-executor.js";
import { Tools } from "./tools.js";
import { MockHermesAdapter } from "./mock-hermes.adapter.js";
import { HERMES, EXECUTOR_ENABLED, type HermesPort } from "./hermes.port.js";
export interface AgentDependencies {
  hermesFactory?: (tools: Tools) => HermesPort;
  startExecutor?: boolean;
}
@Module({})
export class AgentsModule {
  static forRoot(
    config: ApiConfig,
    clock: Clock,
    deps: AgentDependencies = {},
  ): DynamicModule {
    return {
      module: AgentsModule,
      imports: [CrmModule.forRoot(config, clock)],
      controllers: [AgentsController],
      providers: [
        AuditService,
        AgentsService,
        Tools,
        RunExecutor,
        {
          provide: HERMES,
          useFactory:
            deps.hermesFactory ??
            ((tools: Tools) => new MockHermesAdapter(tools)),
          inject: [Tools],
        },
        { provide: EXECUTOR_ENABLED, useValue: deps.startExecutor ?? true },
      ],
      exports: [AgentsService, RunExecutor],
    };
  }
}
