import {
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
} from "@nestjs/common";
import type pg from "pg";
import { AuthController } from "./auth.controller.js";
import { AuthService, DB } from "./auth.service.js";
import { SessionGuard } from "./session.guard.js";
import { LoginRateLimiter } from "./rate-limit.js";
import { AuditService } from "../audit/audit.service.js";
import { SystemClock } from "../clock.js";
import { createDb, createPool } from "../db/client.js";
import { CLOCK } from "../http/health.controller.js";

const POOL = Symbol("POOL");

@Injectable()
class PoolLifecycle implements OnModuleDestroy {
  constructor(@Inject(POOL) private readonly pool: pg.Pool) {}
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  controllers: [AuthController],
  providers: [
    { provide: POOL, useFactory: () => createPool() },
    {
      provide: DB,
      useFactory: (dbPool: pg.Pool) => createDb(dbPool),
      inject: [POOL],
    },
    { provide: CLOCK, useClass: SystemClock },
    {
      provide: AuthService,
      useFactory: (
        db: ReturnType<typeof createDb>,
        clock: SystemClock,
        audit: AuditService,
      ) => new AuthService(db, clock, audit),
      inject: [DB, CLOCK, AuditService],
    },
    AuditService,
    SessionGuard,
    {
      provide: LoginRateLimiter,
      useFactory: (clock: SystemClock) => new LoginRateLimiter(clock),
      inject: [CLOCK],
    },
    PoolLifecycle,
  ],
  exports: [AuthService, SessionGuard, DB, CLOCK],
})
export class AuthModule {}
