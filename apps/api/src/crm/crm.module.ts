import type { ApiConfig } from "../app.js";
import type { Clock } from "../clock.js";
import { Module, type DynamicModule } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { AuditService } from "../audit/audit.service.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import { LeadsController } from "./leads.controller.js";
import { LeadsService } from "./leads.service.js";
import { ConversationsController } from "./conversations.controller.js";
import { ConversationsService } from "./conversations.service.js";

@Module({})
export class CrmModule {
  static forRoot(config: ApiConfig, clock: Clock): DynamicModule {
    return {
      module: CrmModule,
      imports: [AuthModule.forRoot(config, clock)],
      controllers: [LeadsController, ConversationsController],
      providers: [
        AuditService,
        IdempotencyService,
        LeadsService,
        ConversationsService,
      ],
      exports: [
        IdempotencyService,
        LeadsService,
        ConversationsService,
        AuthModule,
      ],
    };
  }
}
