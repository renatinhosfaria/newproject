import { expect, login, test } from "./fixtures.js";

test("credenciais inválidas mostram erro associado sem revelar a conta", async ({
  page,
  actor,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(actor.email);
  await page.getByLabel("Senha").fill("senha-incorreta-123");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "E-mail ou senha inválidos.",
  );
  await expect(page.getByLabel("E-mail")).toHaveValue(actor.email);
  await expect(page).toHaveURL(/\/login$/);
});

test("rota protegida sem sessão leva ao login", async ({ page }) => {
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
});

test("login com vários workspaces exige escolha e supervisor vê contexto sem carteira", async ({
  page,
  stack,
}) => {
  const supervisor = stack.fixtures.supervisor;
  await login(page, supervisor);
  const choice = page.getByRole("group", { name: "Escolha o workspace" });
  await expect(choice).toBeVisible();
  await expect(choice.getByRole("radio")).toHaveCount(2);
  await choice.getByRole("radio", { name: "Pacaembu local" }).check();
  await page.getByRole("button", { name: "Continuar" }).click();

  const main = page.getByRole("main");
  await expect(main.getByText("Supervisor local")).toBeVisible();
  await expect(main.getByText("Supervisor", { exact: true })).toBeVisible();
  await expect(main.getByText("Pacaembu local")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Módulos indisponíveis neste ciclo" }),
  ).toBeVisible();
  // Never an empty portfolio that looks like real data.
  await expect(page.getByRole("button", { name: "Novo lead" })).toHaveCount(0);
  await expect(page.getByText(/nenhum lead/i)).toHaveCount(0);

  await page.goto("/leads");
  await expect(
    page.getByRole("heading", { name: "Módulos indisponíveis neste ciclo" }),
  ).toBeVisible();
});

test("escolha do segundo workspace abre o contexto correspondente", async ({
  page,
  stack,
}) => {
  await login(page, stack.fixtures.supervisor);
  await page.getByRole("radio", { name: "Workspace C" }).check();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão do supervisor" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByText("Workspace C")).toBeVisible();
  // Ask with the browser's own same-origin session cookie.
  const me = await page.evaluate(() =>
    fetch("/api/auth/me").then((response) => response.json()),
  );
  expect(me.workspace_id).toBe(stack.fixtures.multiWorkspace.workspaceId);
});

test("logout revoga a sessão e volta ao login", async ({ page, actor }) => {
  await login(page, actor);
  await expect(page.getByRole("button", { name: "Novo lead" })).toBeVisible();
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "crm_session",
  );
  expect(cookie?.httpOnly).toBe(true);
  // The session token never reaches script-accessible storage.
  const stored = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage, c: document.cookie }),
  );
  expect(stored).not.toContain(cookie!.value);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/leads");
  await expect(page).toHaveURL(/\/login$/);
  const replay = await page.request.get("/api/auth/me", {
    headers: { cookie: `crm_session=${cookie!.value}` },
  });
  expect(replay.status()).toBe(401);
});

test("mutação rejeitada por CSRF mostra erro e não cria o lead", async ({
  page,
  actor,
}) => {
  await login(page, actor);
  await page.route("**/api/leads", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    // Replays the browser request with a foreign Origin; the real API decides.
    const response = await route.fetch({
      headers: { ...route.request().headers(), origin: "https://evil.example" },
    });
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Novo lead" }).click();
  await page.getByLabel("Nome").fill("Lead forjado");
  await page.getByRole("button", { name: "Salvar lead" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "A solicitação foi bloqueada por segurança",
  );
  await expect(page.getByLabel("Nome")).toHaveValue("Lead forjado");
  const leads = await page.request.get("/api/leads");
  expect((await leads.json()).items).toHaveLength(0);
});

test("falha ao revogar no logout não finge saída e permite tentar de novo", async ({
  page,
  actor,
}) => {
  await login(page, actor);
  await expect(page.getByRole("button", { name: "Novo lead" })).toBeVisible();
  let failed = false;
  await page.route("**/api/auth/logout", async (route) => {
    if (failed) return route.continue();
    failed = true;
    await route.abort("connectionreset");
  });
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Não foi possível encerrar a sessão" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/leads/);
  const me = await page.evaluate(() =>
    fetch("/api/auth/me").then((response) => response.status),
  );
  expect(me).toBe(200);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const after = await page.evaluate(() =>
    fetch("/api/auth/me").then((response) => response.status),
  );
  expect(after).toBe(401);
});
