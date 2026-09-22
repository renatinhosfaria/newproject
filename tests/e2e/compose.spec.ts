import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

const run = promisify(execFile);
const composeFile = join(process.cwd(), "infra/compose/compose.yaml");

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

test("proxy keeps a real CRM lead after restarting API and streams Agent events", async () => {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const project = `pacaembu_e2e_${process.pid}_${randomBytes(3).toString("hex")}`;
  const temp = await mkdtemp(join(tmpdir(), "pacaembu-compose-"));
  const envFile = join(temp, ".env");
  const brokerEmail = "broker.compose@example.test";
  const brokerPassword = randomBytes(24).toString("hex");
  await writeFile(
    envFile,
    [
      `APP_PORT=${port}`,
      `APP_ORIGIN=${origin}`,
      `DB_OWNER_PASSWORD=${randomBytes(24).toString("hex")}`,
      `DB_APP_PASSWORD=${randomBytes(24).toString("hex")}`,
      "SEED_SUPERVISOR_EMAIL=supervisor.compose@example.test",
      `SEED_SUPERVISOR_PASSWORD=${randomBytes(24).toString("hex")}`,
      `SEED_BROKER_EMAIL=${brokerEmail}`,
      `SEED_BROKER_PASSWORD=${brokerPassword}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  const composeArgs = [
    "compose",
    "-p",
    project,
    "--env-file",
    envFile,
    "-f",
    composeFile,
  ];
  const compose = async (...args: string[]) =>
    run("docker", [...composeArgs, ...args], { timeout: 8 * 60 * 1000 });
  try {
    await compose("up", "--build", "--wait", "-d");
    const ready = await fetch(`${origin}/api/health/ready`);
    expect(ready.status).toBe(200);
    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", Origin: origin },
      body: JSON.stringify({ email: brokerEmail, password: brokerPassword }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    expect(cookie).toBeTruthy();
    const post = (path: string, body: unknown, key?: string) =>
      fetch(`${origin}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Cookie: cookie!,
          Origin: origin,
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        body: JSON.stringify(body),
      });
    const leadResponse = await post("/api/leads", { name: "Pessoa Compose" });
    expect(leadResponse.status).toBe(201);
    const lead = (await leadResponse.json()) as { id: string };
    await compose("restart", "api");
    let recovered = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const health = await fetch(`${origin}/api/health/ready`).catch(
        () => undefined,
      );
      if (health?.ok) {
        recovered = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    expect(recovered).toBe(true);
    const leadAfterRestart = await fetch(`${origin}/api/leads/${lead.id}`, {
      headers: { Cookie: cookie! },
    });
    expect(leadAfterRestart.status).toBe(200);
    expect((await leadAfterRestart.json()).name).toBe("Pessoa Compose");

    const conversationResponse = await post(
      "/api/conversations",
      { lead_id: lead.id },
      "compose-conversation-0001",
    );
    expect(conversationResponse.status).toBe(201);
    const conversation = (await conversationResponse.json()) as { id: string };
    const sessionResponse = await post(
      "/api/agent-sessions",
      {
        agent_id: "atendimento",
        lead_id: lead.id,
        conversation_id: conversation.id,
      },
      "compose-agent-session-0001",
    );
    expect(sessionResponse.status).toBe(201);
    const session = (await sessionResponse.json()) as { id: string };
    const runResponse = await post(
      `/api/agent-sessions/${session.id}/messages`,
      {
        content: "Prepare um rascunho para esta pessoa",
      },
      "compose-agent-message-0001",
    );
    expect(runResponse.status).toBe(202);
    const agentRun = (await runResponse.json()) as { run_id: string };
    const stream = await fetch(
      `${origin}/api/agent-sessions/${session.id}/events?run_id=${agentRun.run_id}`,
      {
        headers: { Cookie: cookie! },
        signal: AbortSignal.timeout(20000),
      },
    );
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    expect(await stream.text()).toContain("event: agent.run.completed");
  } finally {
    await compose("down", "-v", "--remove-orphans").catch(() => undefined);
    await rm(temp, { recursive: true, force: true });
  }
});
