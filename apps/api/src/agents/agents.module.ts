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
import { EventsController } from "./events.controller.js";
import { EventStore } from "./event-store.js";
import {
  SseStreams,
  SSE_SCHEDULER,
  systemSseScheduler,
  type SseScheduler,
} from "./sse.js";
export interface AgentDependencies {
  sseScheduler?: SseScheduler;
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
      controllers: [AgentsController, EventsController],
      providers: [
        AuditService,
        AgentsService,
        Tools,
        RunExecutor,
        EventStore,
        SseStreams,
        {
          provide: SSE_SCHEDULER,
          useValue: deps.sseScheduler ?? systemSseScheduler,
        },
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
