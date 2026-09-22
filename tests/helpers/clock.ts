import type { Clock } from "../../apps/api/src/clock.js";

export class ManualClock implements Clock {
  constructor(private value = new Date("2026-01-01T00:00:00.000Z")) {}
  now(): Date {
    return new Date(this.value);
  }
  advance(ms: number): void {
    this.value = new Date(this.value.getTime() + ms);
  }
  set(value: Date): void {
    this.value = new Date(value);
  }
}
