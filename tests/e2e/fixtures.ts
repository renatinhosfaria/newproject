import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { test as base, expect, type Page } from "@playwright/test";
import type { Fixture, Fixtures } from "../helpers/fixtures.js";
import type { MockScenario } from "../helpers/agent-adapter.js";

export interface Stack {
  baseURL: string;
  fixtures: Fixtures;
  /** Test-only controls sent over the child's stdin (no HTTP surface). */
  control(cmd: string, ...args: string[]): Promise<unknown>;
}

const root = fileURLToPath(new URL("../..", import.meta.url));
export const webURL = process.env.E2E_WEB_URL ?? "http://127.0.0.1:3100";

async function startStack(
  scenario: MockScenario | undefined,
): Promise<{ stack: Stack; stop(): Promise<void> }> {
  const child: ChildProcessWithoutNullStreams = spawn(
    resolve(root, "node_modules/.bin/tsx"),
    ["tests/e2e/support/stack.ts", scenario ?? ""],
    {
      cwd: root,
      env: { ...process.env, NODE_ENV: "test", E2E_WEB_URL: webURL },
    },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));
  const pending = new Map<
    number,
    { resolve(v: unknown): void; reject(e: Error): void }
  >();
  let nextId = 1;
  const ready = new Promise<{ baseURL: string; fixtures: Fixtures }>(
    (resolveReady, rejectReady) => {
      const lines = createInterface({ input: child.stdout });
      lines.on("line", (line) => {
        const message = JSON.parse(line);
        if (message.type === "ready") resolveReady(message);
        else if (typeof message.id === "number") {
          const waiter = pending.get(message.id);
          pending.delete(message.id);
          if (message.ok) waiter?.resolve(message.result);
          else waiter?.reject(new Error(message.error));
        }
      });
      child.once("exit", (code) =>
        rejectReady(new Error(`stack exited (${code}): ${stderr}`)),
      );
    },
  );
  const { baseURL, fixtures } = await ready;
  return {
    stack: {
      baseURL,
      fixtures,
      control(cmd, ...args) {
        const id = nextId++;
        return new Promise((resolveCommand, reject) => {
          pending.set(id, { resolve: resolveCommand, reject });
          child.stdin.write(`${JSON.stringify({ id, cmd, args })}\n`);
        });
      },
    },
    async stop() {
      if (child.exitCode !== null) return;
      const exited = new Promise((r) => child.once("exit", r));
      child.stdin.end();
      await exited;
    },
  };
}

export const test = base.extend<{
  mockScenario: MockScenario | undefined;
  stack: Stack;
  actor: Fixture;
}>({
  mockScenario: [undefined, { option: true }],
  stack: async ({ mockScenario }, use) => {
    const { stack, stop } = await startStack(mockScenario);
    try {
      await use(stack);
    } finally {
      await stop();
    }
  },
  baseURL: async ({ stack }, use) => {
    await use(stack.baseURL);
  },
  actor: async ({ stack }, use) => {
    await use(stack.fixtures.brokerA);
  },
});

export { expect };

export async function login(page: Page, actor: Fixture): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(actor.email);
  await page.getByLabel("Senha").fill(actor.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Creates a lead through the UI and lands on its record. */
export async function createLead(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Novo lead" }).click();
  await page.getByLabel("Nome").fill(name);
  await page.getByRole("button", { name: "Salvar lead" }).click();
  await page.getByRole("link", { name }).click();
}

/** Full broker path up to an Agent session tied to a new conversation. */
export async function openAgentSession(
  page: Page,
  actor: Fixture,
  leadName = "Pessoa de teste",
): Promise<void> {
  await login(page, actor);
  await createLead(page, leadName);
  await page.getByRole("button", { name: "Abrir conversa" }).click();
  await page.getByRole("button", { name: "Atendimento" }).click();
  await expect(page.getByLabel("Mensagem para o Agent")).toBeVisible();
}

export const DRAFT_TEXT =
  "[Atendimento simulado] Olá! Posso ajudar a esclarecer suas dúvidas sobre o imóvel nesta conversa?";
