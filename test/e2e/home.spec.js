const { test, expect } = require("@playwright/test");

test.describe("Landing page", () => {
  test("renders hero, search bar and asset categories", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Stock Signals/);
    await expect(page.locator("h1")).toContainText("Sinais técnicos");
    await expect(page.locator("#search-input")).toBeVisible();
    await expect(page.getByRole("link", { name: /PETR4/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /BTC-USD/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /USDBRL/ }).first()).toBeVisible();

    await page.screenshot({
      path: testInfo.outputPath("home.png"),
      fullPage: false,
    });
    await testInfo.attach("home", { path: testInfo.outputPath("home.png"), contentType: "image/png" });
  });

  test("search autocomplete returns suggestions", async ({ page }, testInfo) => {
    await page.goto("/");
    const input = page.locator("#search-input");
    await input.fill("petro");
    await page.waitForResponse((r) => r.url().includes("/api/search"));
    const results = page.locator("#search-results .search-item");
    await expect(results.first()).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: testInfo.outputPath("search.png") });
    await testInfo.attach("search", { path: testInfo.outputPath("search.png"), contentType: "image/png" });
  });

  test("slash key focuses the search input", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("/");
    const focused = await page.evaluate(() => document.activeElement?.id);
    expect(focused).toBe("search-input");
  });

  test("favorites section is hidden initially", async ({ page }) => {
    await page.goto("/");
    const section = page.locator("#favorites-category");
    await expect(section).not.toHaveClass(/has-favorites/);
  });
});
