import type { ApiConfig } from "./app.js";
import type { Clock } from "./clock.js";
import { Module } from "@nestjs/common";
import { CLOCK, HealthController } from "./http/health.controller.js";
import { CrmModule } from "./crm/crm.module.js";
import type { DynamicModule } from "@nestjs/common";

@Module({
  imports: [],
  controllers: [HealthController],
})
export class AppModule {
  static forRoot(config: ApiConfig, clock: Clock): DynamicModule {
    return {
      module: AppModule,
      imports: [CrmModule.forRoot(config, clock)],
      controllers: [HealthController],
      providers: [{ provide: CLOCK, useValue: clock }],
    };
  }
}
