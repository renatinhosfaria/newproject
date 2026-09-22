import pg from "pg";
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
  seedAgain(): Promise<void>;
  close(): Promise<void>;
}

const credentials: DevCredentials = {
  supervisorEmail: "supervisor.test@example.test",
  supervisorPassword: "test-supervisor-password",
  brokerEmail: "broker-a.test@example.test",
  brokerPassword: "test-broker-password",
};

// Vitest runs integration files concurrently against the same isolated
// database. Serialize migration/role setup so PostgreSQL does not race on
// system catalog rows (the application requests themselves remain parallel).
let setupQueue: Promise<void> = Promise.resolve();

async function acquireSetup(): Promise<() => void> {
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = setupQueue;
  setupQueue = setupQueue.then(() => turn);
  await previous;
  return release;
}

export async function createHarness(): Promise<TestHarness> {
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
  const ownerPool = new pg.Pool({ connectionString: ownerUrl });
  const pool = new pg.Pool({ connectionString: appUrl, max: 1 });
  const releaseSetup = await acquireSetup();
  try {
    await migrate(ownerPool);
    await grantAppRole(ownerPool);
    const db = drizzle(ownerPool, { schema });
    await seed(db, credentials);
    const fixtures = await installFixtures(ownerPool);
    await pool.query("select set_config('app.workspace_id', $1, false)", [
      fixtures.brokerA.workspaceId,
    ]);
    await pool.query("select set_config('app.broker_id', $1, false)", [
      fixtures.brokerA.brokerId,
    ]);
    const clock = new ManualClock();
    const app = await createApp(
      {
        nodeEnv: "test",
        allowedOrigin: "http://localhost:3000",
        databaseUrl: appUrl,
      },
      { clock },
    );
    releaseSetup();
    return {
      db,
      pool,
      ownerPool,
      fixtures,
      clock,
      app,
      http: new TestHttpClient(app),
      seedAgain: () => seed(db, credentials),
      close: async () => {
        await app.close();
        await pool.end();
        await ownerPool.end();
      },
    };
  } catch (error) {
    releaseSetup();
    await pool.end();
    await ownerPool.end();
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

async function grantAppRole(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Vitest workers are separate processes, so the in-process setup queue is
    // insufficient for catalog writes. A database advisory lock serializes
    // role grants across workers without affecting application requests.
    await client.query("SELECT pg_advisory_lock(284731)");
    await client.query("GRANT USAGE ON SCHEMA public TO pacaembu_app");
    await client.query(
      "GRANT SELECT, INSERT ON workspaces, users, workspace_memberships, auth_sessions, brokers, leads, conversations, messages, agents, agent_capabilities, workspace_agents, agent_sessions, agent_runs, agent_events, idempotency_records, audit_events TO pacaembu_app",
    );
    await client.query("GRANT UPDATE ON auth_sessions TO pacaembu_app");
    await client.query(
      "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pacaembu_app",
    );
    await client.query(
      "REVOKE UPDATE, DELETE ON audit_events FROM pacaembu_app",
    );
    await client.query("SELECT pg_advisory_unlock(284731)");
  } finally {
    client.release();
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
