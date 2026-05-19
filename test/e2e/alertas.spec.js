const { test, expect } = require("@playwright/test");

test.describe("Alertas", () => {
  test("renders form and accepts subscription", async ({ page }, testInfo) => {
    await page.goto("/alertas");
    await expect(page).toHaveTitle(/Alertas/i);
    await expect(page.locator("#alertForm")).toBeVisible();
    await expect(page.locator(".tickers-picker__chip").first()).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("alertas-empty.png"), fullPage: false });
    await testInfo.attach("alertas-empty", { path: testInfo.outputPath("alertas-empty.png"), contentType: "image/png" });

    await page.fill("#emailInput", "test@example.com");
    await page.locator(".tickers-picker__chip").first().click();
    await page.locator(".tickers-picker__chip").nth(1).click();
    await page.click("#alertForm button[type='submit']");

    await expect(page.locator("#successCard")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#confirmLink")).toContainText(/confirm/);

    await page.screenshot({ path: testInfo.outputPath("alertas-success.png"), fullPage: false });
    await testInfo.attach("alertas-success", { path: testInfo.outputPath("alertas-success.png"), contentType: "image/png" });
  });

  test("rejects invalid email with friendly error", async ({ page }) => {
    await page.goto("/alertas");
    await page.fill("#emailInput", "not-an-email");
    await page.locator(".tickers-picker__chip").first().click();
    await page.click("#alertForm button[type='submit']");
    await expect(page.locator("#formStatus")).toContainText(/inválido/);
  });
});
