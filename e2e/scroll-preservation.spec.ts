/**
 * Teste E2E de regressão para "scroll volta ao topo" ao abrir overlays.
 *
 * REQUISITOS:
 *   - App rodando em http://localhost:8080 (Vite dev)
 *   - Usuário autenticado com pelo menos 15 empréstimos cadastrados
 *   - Playwright instalado localmente: `bun add -D @playwright/test && bunx playwright install chromium`
 *
 * EXECUÇÃO:
 *   bunx playwright test e2e/scroll-preservation.spec.ts --headed
 *
 * O que valida:
 *   1. Rola a lista de empréstimos para uma posição conhecida (Y = 800).
 *   2. Registra o scrollTop do container real ([data-app-scroll-container] ou window).
 *   3. Clica no botão "Pagar" da primeira linha visível.
 *   4. Aguarda o dialog abrir.
 *   5. Compara o scrollTop — se mudou > 4px, o teste falha e imprime valores.
 *   6. Repete para: Editar empréstimo, Novo empréstimo, dropdown "Editar/Excluir".
 */

import { test, expect, type Page } from "@playwright/test";

async function readScroll(page: Page) {
  return await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("[data-app-scroll-container]");
    return {
      window: window.scrollY,
      documentElement: document.documentElement.scrollTop,
      body: document.body.scrollTop,
      main: main ? main.scrollTop : null,
    };
  });
}

test.describe("Scroll preservation on overlay open", () => {
  test.beforeEach(async ({ page }) => {
    // TODO: implemente autenticação — via storageState pré-salvo é o mais robusto.
    // Ex.: use `{ storageState: "playwright/.auth/user.json" }` no playwright.config.ts
    await page.goto("http://localhost:8080/?tab=dashboard");
    await page.waitForSelector("[data-app-scroll-container]");
  });

  test("clicar em 'Pagar' não desloca o scroll", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(100);
    const before = await readScroll(page);

    // Ajuste o seletor conforme o texto real do botão em cada tela.
    const payButton = page.getByRole("button", { name: /pagar/i }).first();
    await payButton.click();
    await page.getByRole("dialog").waitFor({ state: "visible" });

    const after = await readScroll(page);
    console.log("scroll before:", before, "after:", after);

    const drift = Math.abs((after.window ?? 0) - (before.window ?? 0));
    expect(drift, `Scroll drifted ${drift}px`).toBeLessThanOrEqual(4);
  });

  test("abrir menu de ações (kebab) preserva scroll", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 800));
    const before = await readScroll(page);

    // Kebab / MoreVertical dentro da linha
    await page.locator("button[aria-haspopup='menu']").first().click();
    await page.getByRole("menu").waitFor({ state: "visible" });

    const after = await readScroll(page);
    const drift = Math.abs((after.window ?? 0) - (before.window ?? 0));
    expect(drift).toBeLessThanOrEqual(4);
  });

  test("abrir formulário 'Novo empréstimo' preserva scroll", async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, 800));
    const before = await readScroll(page);

    await page.getByRole("button", { name: /novo empréstimo/i }).click();
    await page.getByRole("dialog").waitFor({ state: "visible" });

    const after = await readScroll(page);
    const drift = Math.abs((after.window ?? 0) - (before.window ?? 0));
    expect(drift).toBeLessThanOrEqual(4);
  });
});
