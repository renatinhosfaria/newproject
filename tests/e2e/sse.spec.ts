import type { Page, Request } from "@playwright/test";
import { DRAFT_TEXT, expect, openAgentSession, test } from "./fixtures.js";

test.use({ mockScenario: "hold" });

const STEPS = [
  "Execução iniciada",
  "Consultou o lead",
  "Consultou a conversa",
  "Preparou o rascunho",
];

function eventRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (/\/api\/agent-sessions\/[^/]+\/events/.test(request.url()))
      requests.push(request);
  });
  return requests;
}

async function startHeldRun(page: Page): Promise<string> {
  await page.getByLabel("Mensagem para o Agent").fill("Pedido em streaming");
  await page.getByRole("button", { name: "Gerar rascunho" }).click();
  const status = page.getByRole("status").filter({ hasText: "Processando" });
  await expect(status).toBeVisible();
  await expect(status).toHaveAttribute("aria-live", "polite");
  // Four events are committed before the mock holds the output.
  await expect(
    page.getByText("Preparou o rascunho", { exact: true }),
  ).toBeVisible();
  const sessionId = new URL(page.url()).pathname.split("/").pop()!;
  const session = await page.request.get(`/api/agent-sessions/${sessionId}`);
  return (await session.json()).runs[0].run_id as string;
}

test("reconexão retoma pelo Last-Event-ID e mostra cada evento uma única vez", async ({
  page,
  actor,
  stack,
}) => {
  const requests = eventRequests(page);
  await openAgentSession(page, actor);
  const runId = await startHeldRun(page);
  expect(await stack.control("drop-sse")).toBeGreaterThan(0);
  await expect.poll(() => requests.length, { timeout: 15_000 }).toBe(2);
  expect(await requests[1].headerValue("last-event-id")).toBe(`${runId}:4`);
  expect(requests[1].url()).toContain(`run_id=${runId}`);

  await stack.control("release");
  await expect(page.getByText(DRAFT_TEXT, { exact: true })).toHaveCount(1);
  for (const step of STEPS)
    await expect(page.getByText(step, { exact: true })).toHaveCount(1);
  // Terminal event: the client does not reconnect afterwards.
  await page.waitForTimeout(1500);
  expect(requests).toHaveLength(2);

  await page.reload();
  await expect(page.getByText(DRAFT_TEXT, { exact: true })).toHaveCount(1);
  await expect(
    page.getByText("Pedido em streaming", { exact: true }),
  ).toHaveCount(1);
});

test("cursor expirado (410) recupera o histórico pela sessão", async ({
  page,
  actor,
  stack,
}) => {
  const requests = eventRequests(page);
  await openAgentSession(page, actor);
  const runId = await startHeldRun(page);
  await stack.control("block-sse");
  await stack.control("drop-sse");
  await stack.control("release");
  const sessionId = new URL(page.url()).pathname.split("/").pop()!;
  await expect
    .poll(async () => {
      const session = await page.request.get(
        `/api/agent-sessions/${sessionId}`,
      );
      return (await session.json()).runs[0].status;
    })
    .toBe("completed");
  await stack.control("expire-events", runId);
  await stack.control("unblock-sse");

  await expect(
    page.getByText("Eventos em tempo real expiraram. Histórico recuperado."),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(DRAFT_TEXT, { exact: true })).toHaveCount(1);
  const last = requests[requests.length - 1];
  expect(await last.headerValue("last-event-id")).toBe(`${runId}:4`);
});

test("sessão revogada durante o streaming leva ao login", async ({
  page,
  actor,
  stack,
}) => {
  await openAgentSession(page, actor);
  await startHeldRun(page);
  await stack.control("revoke-sessions");
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "Sua sessão terminou. Entre novamente.",
  );
});

test("erro HTTP não retentável no acompanhamento não entra em laço de reconexão", async ({
  page,
  actor,
  stack,
}) => {
  const counts = { events: 0, session: 0 };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/agent-sessions\/[^/]+\/events$/.test(path)) counts.events += 1;
    else if (/^\/api\/agent-sessions\/[^/]+$/.test(path)) counts.session += 1;
  });
  await openAgentSession(page, actor);
  await startHeldRun(page);
  // The Agent becomes unavailable while the run is still active: the stream
  // answers 403 on reconnection and GET session still shows the run running.
  await stack.control("disable-agent");
  await stack.control("drop-sse");
  const alert = page
    .getByRole("main")
    .getByRole("alert")
    .filter({ hasText: "Não foi possível acompanhar a execução" });
  await expect(alert).toBeVisible();
  const before = { ...counts };
  await page.waitForTimeout(5000);
  // No automatic re-follow: at most one extra request of each kind.
  expect(counts.events - before.events).toBeLessThanOrEqual(1);
  expect(counts.session - before.session).toBeLessThanOrEqual(1);
  await expect(alert).toBeVisible();

  // Manual retry once the policy allows it again resumes the run.
  await stack.control("enable-agent");
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(alert).toHaveCount(0);
  await stack.control("release");
  await expect(page.getByText(DRAFT_TEXT, { exact: true })).toHaveCount(1);
});
