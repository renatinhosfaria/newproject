import type { ApiConfig } from "./app.js";
import type { Clock } from "./clock.js";
import { Module } from "@nestjs/common";
import { HealthController } from "./http/health.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import type { DynamicModule } from "@nestjs/common";

@Module({
  imports: [],
  controllers: [HealthController],
})
export class AppModule {
  static forRoot(config: ApiConfig, clock: Clock): DynamicModule {
    return {
      module: AppModule,
      imports: [AuthModule.forRoot(config, clock)],
      controllers: [HealthController],
    };
  }
}
