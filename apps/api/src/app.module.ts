import { Module } from "@nestjs/common";
import { HealthController, CLOCK } from "./http/health.controller.js";
import { SystemClock } from "./clock.js";

@Module({
  controllers: [HealthController],
  providers: [{ provide: CLOCK, useClass: SystemClock }],
})
export class AppModule {}
