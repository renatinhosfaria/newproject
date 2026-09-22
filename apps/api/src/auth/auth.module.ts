import type { ApiConfig } from "../app.js";
import type { Clock } from "../clock.js";
import {
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
  type DynamicModule,
} from "@nestjs/common";
import type pg from "pg";
import { AuthController, AUTH_CONFIG } from "./auth.controller.js";
import { AuthService, DB } from "./auth.service.js";
import { SessionGuard } from "./session.guard.js";
import { LoginRateLimiter } from "./rate-limit.js";
import { AuditService } from "../audit/audit.service.js";
import { SystemClock } from "../clock.js";
import { createDb, createPool } from "../db/client.js";
import { CLOCK } from "../http/health.controller.js";

const POOL = Symbol("POOL");
const DATABASE_URL = Symbol("DATABASE_URL");

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
    {
      provide: POOL,
      useFactory: (url: string) => createPool(url),
      inject: [DATABASE_URL],
    },
    { provide: DATABASE_URL, useFactory: () => process.env.DATABASE_URL },
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
export class AuthModule {
  static forRoot(config: ApiConfig, clock: Clock): DynamicModule {
    return {
      module: AuthModule,
      providers: [
        { provide: DATABASE_URL, useValue: config.databaseUrl },
        { provide: CLOCK, useValue: clock },
        { provide: AUTH_CONFIG, useValue: config },
      ],
    };
  }
}
