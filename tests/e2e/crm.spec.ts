import {
  DRAFT_TEXT,
  createLead,
  expect,
  login,
  openAgentSession,
  test,
} from "./fixtures.js";

test("corretor cria lead, abre conversa e mantém o rascunho após recarregar", async ({
  page,
  actor,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(actor.email);
  await page.getByLabel("Senha").fill(actor.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: "Novo lead" }).click();
  await page.getByLabel("Nome").fill("Pessoa de teste");
  await page.getByRole("button", { name: "Salvar lead" }).click();
  await page.getByRole("link", { name: "Pessoa de teste" }).click();
  await page.getByRole("button", { name: "Abrir conversa" }).click();
  await page.getByRole("button", { name: "Atendimento" }).click();
  await page
    .getByLabel("Mensagem para o Agent")
    .fill("Prepare uma apresentação");
  await page.getByRole("button", { name: "Gerar rascunho" }).click();
  await expect(
    page.getByText("Rascunho não enviado", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(DRAFT_TEXT, { exact: true })).toHaveCount(1);
  await expect(page.getByText("Simulado", { exact: true })).toBeVisible();
  // The draft is guidance only: no send or approval action exists.
  await expect(
    page.getByRole("button", { name: /enviar|aprovar/i }),
  ).toHaveCount(0);

  await page.reload();
  await expect(
    page.getByText("Prepare uma apresentação", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(DRAFT_TEXT, { exact: true })).toHaveCount(1);

  // The same draft is persisted in the conversation history, still unsent.
  await page.getByRole("link", { name: "Voltar para a conversa" }).click();
  await expect(page.getByText(DRAFT_TEXT, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Rascunho não enviado", { exact: true }),
  ).toBeVisible();
});

test("lead pode ser editado e mantém valores quando a validação falha", async ({
  page,
  actor,
}) => {
  await login(page, actor);
  await createLead(page, "Lead editável");
  await page.getByRole("button", { name: "Editar lead" }).click();
  const name = page.getByLabel("Nome");
  await name.fill("L");
  await page.getByLabel("Interesse").fill("Apartamento 2 dormitórios");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(
    "Informe um nome com pelo menos 2 caracteres.",
  );
  await expect(page.getByLabel("Interesse")).toHaveValue(
    "Apartamento 2 dormitórios",
  );
  await name.fill("Lead editado");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.getByRole("heading", { name: "Lead editado" }),
  ).toBeVisible();
  await expect(page.getByText("Apartamento 2 dormitórios")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Lead editado" }),
  ).toBeVisible();
});

test.describe("falha determinística do mock", () => {
  test.use({ mockScenario: "unavailable" });

  test("mostra erro recuperável e preserva o pedido no histórico", async ({
    page,
    actor,
  }) => {
    await openAgentSession(page, actor);
    await page
      .getByLabel("Mensagem para o Agent")
      .fill("Pedido que vai falhar");
    await page.getByRole("button", { name: "Gerar rascunho" }).click();
    await expect(
      page.getByText("Não foi possível gerar o rascunho.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tentar novamente" }),
    ).toBeVisible();
    await expect(
      page.getByText("Rascunho não enviado", { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText("Pedido que vai falhar", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Não foi possível gerar o rascunho.", { exact: true }),
    ).toBeVisible();
  });
});

test("submissão repetida após queda de rede reutiliza a mesma chave e cria uma execução", async ({
  page,
  actor,
}) => {
  await openAgentSession(page, actor);
  const keys: string[] = [];
  let dropped = false;
  await page.route("**/api/agent-sessions/*/messages", async (route) => {
    keys.push(route.request().headers()["idempotency-key"] ?? "");
    if (!dropped) {
      dropped = true;
      // The API commits the run, but the browser never receives the answer.
      await route.fetch();
      await route.abort("connectionreset");
      return;
    }
    await route.continue();
  });
  await page.getByLabel("Mensagem para o Agent").fill("Primeiro pedido");
  await page.getByRole("button", { name: "Gerar rascunho" }).click();
  await expect(
    page.getByText("Rascunho não enviado", { exact: true }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0].length).toBeGreaterThanOrEqual(16);
  await expect(page.getByText("Primeiro pedido", { exact: true })).toHaveCount(
    1,
  );

  const sessionId = new URL(page.url()).pathname.split("/").pop()!;
  const session = await page.request.get(`/api/agent-sessions/${sessionId}`);
  expect((await session.json()).runs).toHaveLength(1);

  // A new intention gets a new key.
  await page.getByLabel("Mensagem para o Agent").fill("Segundo pedido");
  await page.getByRole("button", { name: "Gerar rascunho" }).click();
  await expect(
    page.getByText("Rascunho não enviado", { exact: true }),
  ).toHaveCount(2);
  expect(keys).toHaveLength(3);
  expect(keys[2]).not.toBe(keys[0]);
});

test("conteúdo externo é exibido como texto, sem HTML interpretado", async ({
  page,
  actor,
}) => {
  await login(page, actor);
  const hostile = '<img src=x onerror="window.__xss=1">Lead <b>negrito</b>';
  await page.getByRole("button", { name: "Novo lead" }).click();
  await page.getByLabel("Nome").fill(hostile);
  await page.getByRole("button", { name: "Salvar lead" }).click();
  await expect(page.getByRole("link", { name: hostile })).toBeVisible();
  expect(await page.locator("img").count()).toBe(0);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBe(
    undefined,
  );
});
