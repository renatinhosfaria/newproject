import { Controller, Get, Inject } from "@nestjs/common";
import pg from "pg";
import type { Clock } from "../clock.js";
import { problem } from "./problem.filter.js";

export const CLOCK = Symbol("CLOCK");
export const HEALTH_DATABASE_URL = Symbol("HEALTH_DATABASE_URL");

@Controller("health")
export class LegacyHealthController {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  @Get()
  health() {
    return { status: "ok", now: this.clock.now().toISOString() };
  }
}

@Controller("api/health")
export class HealthController {
  constructor(
    @Inject(HEALTH_DATABASE_URL)
    private readonly databaseUrl: string | undefined,
  ) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    if (!this.databaseUrl) throw problem(503, "NOT_READY");
    const client = new pg.Client({
      connectionString: this.databaseUrl,
      connectionTimeoutMillis: 1500,
    });
    try {
      await client.connect();
      const result = await client.query(
        "SELECT 1 FROM schema_migrations WHERE version='0012' LIMIT 1",
      );
      if (!result.rowCount) throw problem(503, "NOT_READY");
      return { status: "ready" };
    } catch {
      throw problem(503, "NOT_READY");
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
