import { Controller, Get, Inject } from "@nestjs/common";
import type { Clock } from "../clock.js";

export const CLOCK = Symbol("CLOCK");

@Controller("health")
export class HealthController {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  @Get()
  health() {
    return { status: "ok", now: this.clock.now().toISOString() };
  }
}
