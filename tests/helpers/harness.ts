import pg from "pg";
import { randomUUID } from "node:crypto";
import type { ApiConfig } from "../../apps/api/src/app.js";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "../../db/migrate.js";
import { seed, type DevCredentials } from "../../db/seed.js";
import { schema } from "../../apps/api/src/db/schema.js";
import type { Db } from "../../apps/api/src/db/client.js";
import { ManualClock } from "./clock.js";
import type { Fixture, Fixtures } from "./fixtures.js";
import { createApp } from "../../apps/api/src/app.js";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import argon2 from "argon2";

export interface TestHarness {
  db: Db;
  pool: pg.Pool;
  ownerPool: pg.Pool;
  fixtures: Fixtures;
  clock: ManualClock;
  app: NestFastifyApplication;
  http: TestHttpClient;
  logs: string[];
  origin: string;
  seedAgain(): Promise<void>;
  restartApp(): Promise<void>;
  close(): Promise<void>;
}

const credentials: DevCredentials = {
  supervisorEmail: "supervisor.test@example.test",
  supervisorPassword: "test-supervisor-password",
  brokerEmail: "broker-a.test@example.test",
  brokerPassword: "test-broker-password",
};

export async function createHarness(
  config: Omit<ApiConfig, "databaseUrl"> = {},
): Promise<TestHarness> {
  const appUrl = process.env.DATABASE_URL_TEST;
  const ownerUrl = process.env.DATABASE_URL_TEST_OWNER;
  if (!appUrl || !new URL(appUrl).pathname.endsWith("_test")) {
    throw new Error(
      "integration tests require DATABASE_URL_TEST pointing to a database ending in _test",
    );
  }
  if (!ownerUrl || !new URL(ownerUrl).pathname.endsWith("_test")) {
    throw new Error(
      "integration tests require DATABASE_URL_TEST_OWNER pointing to a database ending in _test",
    );
  }
  const schemaName = `test_${randomUUID().replaceAll("-", "")}`;
  const adminPool = new pg.Pool({ connectionString: ownerUrl });
  const scopedUrl = (url: string) => {
    const scoped = new URL(url);
    scoped.searchParams.set("options", `-csearch_path=${schemaName},pg_temp`);
    return scoped.toString();
  };
  const ownerPool = new pg.Pool({ connectionString: scopedUrl(ownerUrl) });
  const pool = new pg.Pool({ connectionString: scopedUrl(appUrl), max: 1 });
  let app: NestFastifyApplication | undefined;
  let http: TestHttpClient | undefined;
  let closed = false;
  const appConfig = {
    nodeEnv: "test",
    allowedOrigin: "http://localhost:3000",
    ...config,
    databaseUrl: scopedUrl(appUrl),
  };
  const createTestApp = async () =>
    createApp(appConfig, {
      clock,
      logStream: {
        write: (line) => {
          logs.push(line);
        },
      },
    });
  const clock = new ManualClock();
  const logs: string[] = [];
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (app) await app.close();
    } finally {
      await Promise.all([pool.end(), ownerPool.end()]);
      try {
        await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      } finally {
        await adminPool.end();
      }
    }
  };
  try {
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    await migrate(ownerPool, schemaName);
    const ownerDb = drizzle(ownerPool, { schema });
    await seed(ownerDb, credentials);
    const fixtures = await installFixtures(ownerPool);
    await pool.query("select set_config('app.workspace_id', $1, false)", [
      fixtures.brokerA.workspaceId,
    ]);
    await pool.query("select set_config('app.broker_id', $1, false)", [
      fixtures.brokerA.brokerId,
    ]);
    app = await createTestApp();
    http = new TestHttpClient(app);
    return {
      db: drizzle(pool, { schema }),
      pool,
      ownerPool,
      fixtures,
      clock,
      get app() {
        if (!app) throw new Error("test app is closed");
        return app;
      },
      get http() {
        if (!http) throw new Error("test app is closed");
        return http;
      },
      logs,
      origin: appConfig.allowedOrigin,
      seedAgain: async () => {
        await migrate(ownerPool, schemaName);
        await seed(ownerDb, credentials);
      },
      restartApp: async () => {
        if (app) await app.close();
        app = await createTestApp();
        http = new TestHttpClient(app);
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

export interface TestHttpResponse {
  status: number;
  body: any;
  headers: Record<string, string | string[] | number | undefined>;
}

class TestHttpRequest implements PromiseLike<TestHttpResponse> {
  private readonly headers: Record<string, string> = {};
  private payload: unknown;
  constructor(
    private readonly app: NestFastifyApplication,
    private readonly method: string,
    private readonly url: string,
  ) {}
  set(name: string, value: string): this {
    this.headers[name] = value;
    return this;
  }
  send(payload?: unknown): this {
    this.payload = payload;
    return this;
  }
  async execute(): Promise<TestHttpResponse> {
    const response = await this.app.inject({
      method: this.method as any,
      url: this.url,
      headers: this.headers,
      payload: this.payload as any,
    });
    let body: any = response.body;
    try {
      body = response.json();
    } catch {
      /* Empty responses remain strings. */
    }
    return { status: response.statusCode, body, headers: response.headers };
  }
  then<TResult1 = TestHttpResponse, TResult2 = never>(
    onfulfilled?:
      ((value: TestHttpResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export class TestHttpClient {
  constructor(private readonly app: NestFastifyApplication) {}
  get(url: string): TestHttpRequest {
    return new TestHttpRequest(this.app, "GET", url);
  }
  post(url: string): TestHttpRequest {
    return new TestHttpRequest(this.app, "POST", url);
  }
  patch(url: string): TestHttpRequest {
    return new TestHttpRequest(this.app, "PATCH", url);
  }
  delete(url: string): TestHttpRequest {
    return new TestHttpRequest(this.app, "DELETE", url);
  }
}

async function installFixtures(pool: pg.Pool): Promise<Fixtures> {
  const workspace = "00000000-0000-4000-8000-000000000101";
  const workspaceB = "00000000-0000-4000-8000-000000000201";
  const brokerA = await readFixture(
    pool,
    "broker-a.test@example.test",
    workspace,
  );
  const supervisor = await readFixture(
    pool,
    "supervisor.test@example.test",
    workspace,
  );
  const userB = await upsertUser(
    pool,
    "00000000-0000-4000-8000-000000000202",
    "Broker B",
    "broker-b.test@example.test",
  );
  const membershipB = await upsertMembership(
    pool,
    "00000000-0000-4000-8000-000000000203",
    workspace,
    userB,
    "broker",
  );
  const brokerB = await upsertBroker(
    pool,
    "00000000-0000-4000-8000-000000000204",
    workspace,
    userB,
    "Broker B",
  );
  await upsertWorkspace(pool, workspaceB, "Workspace C");
  const userC = await upsertUser(
    pool,
    "00000000-0000-4000-8000-000000000205",
    "Broker C",
    "broker-c.test@example.test",
  );
  const membershipC = await upsertMembership(
    pool,
    "00000000-0000-4000-8000-000000000206",
    workspaceB,
    userC,
    "broker",
  );
  const supervisorSecondMembership = await upsertMembership(
    pool,
    "00000000-0000-4000-8000-000000000207",
    workspaceB,
    supervisor.userId,
    "supervisor",
  );
  const brokerC = await upsertBroker(
    pool,
    "00000000-0000-4000-8000-000000000208",
    workspaceB,
    userC,
    "Broker C",
  );
  const agentId = await upsertAgent(pool);
  await pool.query(
    "INSERT INTO workspace_agents (workspace_id,agent_id,enabled) VALUES ($1,$2,false) ON CONFLICT (workspace_id,agent_id) DO UPDATE SET enabled=EXCLUDED.enabled RETURNING agent_id",
    [workspace, agentId],
  );
  return {
    supervisor,
    brokerA,
    brokerB: {
      userId: userB,
      workspaceId: workspace,
      membershipId: membershipB,
      brokerId: brokerB,
      email: "broker-b.test@example.test",
      password: "test-broker-password",
    },
    brokerC: {
      userId: userC,
      workspaceId: workspaceB,
      membershipId: membershipC,
      brokerId: brokerC,
      email: "broker-c.test@example.test",
      password: "test-broker-password",
    },
    multiWorkspace: {
      ...supervisor,
      workspaceId: workspaceB,
      membershipId: supervisorSecondMembership,
      brokerId: null,
    },
    followUpAgentId: agentId,
  };
}

async function upsertWorkspace(
  pool: pg.Pool,
  id: string,
  name: string,
): Promise<string> {
  const result = await pool.query(
    "INSERT INTO workspaces (id,name,timezone,status) VALUES ($1,$2,'America/Sao_Paulo','active') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name RETURNING id",
    [id, name],
  );
  return result.rows[0].id;
}

async function upsertUser(
  pool: pg.Pool,
  id: string,
  name: string,
  email: string,
): Promise<string> {
  const passwordHash = await argon2.hash(
    email.startsWith("supervisor")
      ? "test-supervisor-password"
      : "test-broker-password",
  );
  const result = await pool.query(
    "INSERT INTO users (id,name,email,password_hash,status) VALUES ($1,$2,$3,$4,'active') ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name, password_hash=EXCLUDED.password_hash, status=EXCLUDED.status RETURNING id",
    [id, name, email, passwordHash],
  );
  return result.rows[0].id;
}

async function upsertMembership(
  pool: pg.Pool,
  id: string,
  workspaceId: string,
  userId: string,
  role: "broker" | "supervisor",
): Promise<string> {
  const result = await pool.query(
    "INSERT INTO workspace_memberships (id,workspace_id,user_id,role,status) VALUES ($1,$2,$3,$4,'active') ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role, status=EXCLUDED.status RETURNING id",
    [id, workspaceId, userId, role],
  );
  return result.rows[0].id;
}

async function upsertBroker(
  pool: pg.Pool,
  id: string,
  workspaceId: string,
  userId: string,
  name: string,
): Promise<string> {
  const result = await pool.query(
    "INSERT INTO brokers (id,workspace_id,user_id,display_name,status) VALUES ($1,$2,$3,$4,'active') ON CONFLICT (workspace_id,user_id) DO UPDATE SET display_name=EXCLUDED.display_name, status=EXCLUDED.status RETURNING id",
    [id, workspaceId, userId, name],
  );
  return result.rows[0].id;
}

async function upsertAgent(pool: pg.Pool): Promise<string> {
  const result = await pool.query(
    "INSERT INTO agents (id,key,name,description,status) VALUES ('00000000-0000-4000-8000-000000000209','follow-up','Follow-up','test-only agent','disabled') ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, status=EXCLUDED.status RETURNING id",
  );
  return result.rows[0].id;
}

async function readFixture(
  pool: pg.Pool,
  email: string,
  workspaceId: string,
): Promise<Fixture> {
  const result = await pool.query(
    `
    SELECT u.id AS user_id, u.email, wm.workspace_id, wm.id AS membership_id, b.id AS broker_id
    FROM users u JOIN workspace_memberships wm ON wm.user_id = u.id
    LEFT JOIN brokers b ON b.workspace_id = wm.workspace_id AND b.user_id = u.id
    WHERE u.email = $1 AND wm.workspace_id = $2
    ORDER BY wm.id
    LIMIT 1
  `,
    [email, workspaceId],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`fixture user not found: ${email}`);
  return {
    userId: row.user_id,
    workspaceId: row.workspace_id,
    membershipId: row.membership_id,
    brokerId: row.broker_id,
    email,
    password: email.startsWith("supervisor")
      ? "test-supervisor-password"
      : "test-broker-password",
  };
}
