const { test, expect } = require("@playwright/test");

test.describe("Sinais do dia", () => {
  test("loads page and renders results or empty state", async ({ page }, testInfo) => {
    await page.goto("/sinais");
    await expect(page).toHaveTitle(/Sinais do dia/);
    await expect(page.locator("h1")).toContainText("Sinais do dia");

    await page.waitForFunction(
      () => {
        const el = document.getElementById("loadingState");
        return el && el.hidden === true;
      },
      { timeout: 60_000 }
    );
    await page.waitForTimeout(500);

    await page.screenshot({ path: testInfo.outputPath("sinais.png"), fullPage: true });
    await testInfo.attach("sinais", { path: testInfo.outputPath("sinais.png"), contentType: "image/png" });
  });

  test("explanation section is visible", async ({ page }) => {
    await page.goto("/sinais");
    await expect(page.getByText(/Cruzamento de alta/i).first()).toBeVisible();
    await expect(page.getByText(/Sobrevenda/i).first()).toBeVisible();
  });
});
