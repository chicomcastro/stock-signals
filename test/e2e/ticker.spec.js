const { test, expect } = require("@playwright/test");

async function waitForAnalysisReady(page) {
  await expect(page.locator(".indicator-status").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".indicator-status .indicator-name");
      return el && el.textContent && el.textContent.trim().length > 0;
    },
    { timeout: 15_000 }
  );
}

test.describe("Ticker page", () => {
  test("renders chart and analysis for PETR4", async ({ page }, testInfo) => {
    await page.goto("/PETR4");
    await expect(page).toHaveTitle(/PETR4 — Análise técnica/);
    await expect(page.locator("h1")).toContainText("PETR4");
    await expect(page.locator("#chart")).toBeVisible();
    await waitForAnalysisReady(page);
    await page.waitForTimeout(400);

    await page.screenshot({
      path: testInfo.outputPath("ticker-PETR4.png"),
      fullPage: false,
    });
    await testInfo.attach("ticker-PETR4", { path: testInfo.outputPath("ticker-PETR4.png"), contentType: "image/png" });
  });

  test("MACD toggle reveals the MACD subplot", async ({ page }, testInfo) => {
    await page.goto("/PETR4");
    await waitForAnalysisReady(page);

    const macdContainer = page.locator("#macd-container");
    await expect(macdContainer).toHaveCSS("display", "none");

    await page.locator("#toggleMacd").scrollIntoViewIfNeeded();
    await page.locator("#toggleMacd").click({ force: true });
    await expect(macdContainer).toHaveCSS("display", "block");
    await page.waitForTimeout(600);

    await page.locator("#toggleMacd").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("ticker-macd.png"),
      fullPage: true,
    });
    await testInfo.attach("ticker-macd", { path: testInfo.outputPath("ticker-macd.png"), contentType: "image/png" });
  });

  test("period buttons switch range", async ({ page }) => {
    await page.goto("/PETR4");
    await waitForAnalysisReady(page);
    const respPromise = page.waitForResponse((r) => r.url().includes("period=1Y"));
    await page.click('button[data-period="1Y"]');
    await respPromise;
    await expect(page.locator('button[data-period="1Y"]')).toHaveClass(/active/);
  });

  test("favorite toggle persists in localStorage", async ({ page }) => {
    await page.goto("/PETR4");
    await waitForAnalysisReady(page);
    await page.click("#favoriteBtn");
    const stored = await page.evaluate(() => localStorage.getItem("stockFavorites"));
    expect(stored).toContain("PETR4");
  });

  test("invalid ticker route shows 400 page", async ({ page }) => {
    const res = await page.goto("/%3Cscript%3E");
    expect(res?.status()).toBe(400);
  });
});
