const { test, expect } = require("@playwright/test");

test.describe("Favoritos", () => {
  test("renders empty state", async ({ page }, testInfo) => {
    await page.goto("/favorites");
    await expect(page).toHaveTitle(/favoritos/i);
    await expect(page.locator("#emptyState")).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("favorites-empty.png"), fullPage: false });
    await testInfo.attach("favorites-empty", { path: testInfo.outputPath("favorites-empty.png"), contentType: "image/png" });
  });

  test("renders populated cards with mini sparkline", async ({ page }, testInfo) => {
    await page.goto("/favorites");
    await page.evaluate(() => {
      localStorage.setItem("stockFavorites", JSON.stringify({ PETR4: "Petrobras PN", VALE3: "Vale" }));
    });
    await page.reload();
    await expect(page.locator(".signal-card").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(800);

    await page.screenshot({ path: testInfo.outputPath("favorites-populated.png"), fullPage: false });
    await testInfo.attach("favorites-populated", { path: testInfo.outputPath("favorites-populated.png"), contentType: "image/png" });
  });
});
