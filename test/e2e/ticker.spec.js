const { test, expect } = require("@playwright/test");

async function waitForChartReady(page) {
  await expect(page.locator(".indicator-row").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(
    () => !!document.querySelector(".indicator-row__value") && document.querySelector(".indicator-row__value").textContent.trim().length > 0,
    { timeout: 20_000 }
  );
}

test.describe("Ticker page", () => {
  test("renders chart, verdict, indicators and backtest", async ({ page }, testInfo) => {
    await page.goto("/PETR4");
    await expect(page).toHaveTitle(/PETR4 — Análise técnica/);
    await expect(page.locator(".ticker-hero__title")).toContainText("PETR4");
    await waitForChartReady(page);
    await expect(page.locator(".verdict")).toBeVisible();

    // Wait for backtest panel to load
    await page.waitForFunction(
      () => {
        const el = document.querySelector("#backtestContent");
        return el && (el.textContent.includes("ocorrência") || el.textContent.includes("Nenhuma") || el.textContent.includes("Sem histórico"));
      },
      { timeout: 20_000 }
    );

    await page.waitForTimeout(500);
    await page.screenshot({ path: testInfo.outputPath("ticker-PETR4.png"), fullPage: false });
    await testInfo.attach("ticker-PETR4", { path: testInfo.outputPath("ticker-PETR4.png"), contentType: "image/png" });
  });

  test("MACD panel toggles", async ({ page }, testInfo) => {
    await page.goto("/PETR4");
    await waitForChartReady(page);

    await expect(page.locator("#macdPanel")).toBeHidden();
    await page.locator("#toggleMacd").scrollIntoViewIfNeeded();
    await page.locator("#toggleMacd").click({ force: true });
    await expect(page.locator("#macdPanel")).toBeVisible();
    await page.waitForTimeout(600);

    await page.screenshot({ path: testInfo.outputPath("ticker-macd.png"), fullPage: true });
    await testInfo.attach("ticker-macd", { path: testInfo.outputPath("ticker-macd.png"), contentType: "image/png" });
  });

  test("framework drawer opens", async ({ page }, testInfo) => {
    await page.goto("/PETR4");
    await waitForChartReady(page);
    await page.click("#frameworkBtn");
    await expect(page.locator("#frameworkDrawer")).toHaveAttribute("aria-hidden", "false");
    await page.waitForTimeout(400);

    await page.screenshot({ path: testInfo.outputPath("ticker-drawer.png"), fullPage: false });
    await testInfo.attach("ticker-drawer", { path: testInfo.outputPath("ticker-drawer.png"), contentType: "image/png" });
  });

  test("period chip switches range", async ({ page }) => {
    await page.goto("/PETR4");
    await waitForChartReady(page);
    const respPromise = page.waitForResponse((r) => r.url().includes("period=1Y"));
    await page.click('.chip[data-period="1Y"]');
    await respPromise;
    await expect(page.locator('.chip[data-period="1Y"]')).toHaveClass(/is-active/);
    const url = new URL(page.url());
    expect(url.searchParams.get("period")).toBe("1Y");
  });

  test("favorite toggle persists in localStorage", async ({ page }) => {
    await page.goto("/PETR4");
    await waitForChartReady(page);
    await page.click("#favoriteBtn");
    const stored = await page.evaluate(() => localStorage.getItem("stockFavorites"));
    expect(stored).toContain("PETR4");
  });

  test("deep link with date and period", async ({ page }) => {
    await page.goto("/PETR4?period=6M&date=2024-06-15&highlight=golden");
    await waitForChartReady(page);
    await expect(page.locator('.chip[data-period="6M"]')).toHaveClass(/is-active/);
    const text = await page.locator("#analysisDate").textContent();
    expect(text).toContain("/2024");
  });

  test("invalid ticker route returns 400", async ({ page }) => {
    const res = await page.goto("/%3Cscript%3E");
    expect(res?.status()).toBe(400);
  });
});
