import type { Locator, Page } from "@playwright/test";
import { expect, login, openAgentSession, test } from "./fixtures.js";

async function focusIndicator(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`;
  });
}

async function hasNoHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
}

test("login funciona só com teclado e associa validações aos campos", async ({
  page,
  actor,
}) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("E-mail")).toBeFocused();
  await page.keyboard.press("Enter");
  const email = page.getByLabel("E-mail");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("Informe o e-mail.");
  await expect(email).toBeFocused();

  await page.keyboard.type(actor.email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Senha")).toBeFocused();
  await page.keyboard.type(actor.password);
  await page.keyboard.press("Tab");
  const submit = page.getByRole("button", { name: "Entrar" });
  await expect(submit).toBeFocused();
  expect(await focusIndicator(submit)).not.toMatch(/^none 0px none$/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Novo lead" })).toBeVisible();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});

test("composer usa Enter para enviar e Shift+Enter para nova linha", async ({
  page,
  actor,
}) => {
  await openAgentSession(page, actor);
  expect(await hasNoHorizontalScroll(page)).toBe(true);
  const composer = page.getByLabel("Mensagem para o Agent");
  await composer.focus();
  await page.keyboard.type("Linha um");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Linha dois");
  await expect(composer).toHaveValue("Linha um\nLinha dois");
  const history = page.getByRole("log", { name: "Histórico da sessão" });
  // Shift+Enter only added a line: nothing was submitted yet.
  await expect(history.getByText("Linha um")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Rascunho não enviado", { exact: true }),
  ).toBeVisible();
  await expect(composer).toHaveValue("");
  await expect(page.getByTestId("run-input")).toHaveText(
    "Linha um\nLinha dois",
    { useInnerText: true },
  );
  await expect(history).toHaveAttribute("aria-live", "polite");
});

test("fontes e recursos são servidos pela própria origem", async ({
  page,
  actor,
  baseURL,
}) => {
  const origins = new Set<string>();
  page.on("request", (request) => origins.add(new URL(request.url()).origin));
  await login(page, actor);
  await expect(page.getByRole("button", { name: "Novo lead" })).toBeVisible();
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts]
      .filter((font) => font.status === "loaded")
      .map((font) => font.family.replaceAll('"', ""));
  });
  expect(loaded).toContain("Nunito Sans");
  expect(loaded).toContain("Dongle");
  expect([...origins]).toEqual([new URL(baseURL!).origin]);
});

test("menu móvel expõe navegação e identidade por teclado", async ({
  page,
  actor,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "somente em 390px");
  await login(page, actor);
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByRole("navigation", { name: "Principal" }),
  ).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  const nav = page.getByRole("navigation", { name: "Principal" });
  await expect(nav.getByRole("link", { name: "Leads" })).toBeFocused();
  await expect(page.getByRole("complementary")).toContainText("Corretor local");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toBeFocused();
  expect(await hasNoHorizontalScroll(page)).toBe(true);
});
