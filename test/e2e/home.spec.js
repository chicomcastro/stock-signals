const { test, expect } = require("@playwright/test");

test.describe("Home / landing", () => {
  test("renders shell + hero + categories", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Stock Signals/);
    await expect(page.locator(".app-header__brand")).toBeVisible();
    await expect(page.locator(".hero h1")).toContainText(/Sinais|jargão/i);
    await expect(page.getByRole("link", { name: /PETR4/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /BTC-USD/ }).first()).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: false });
    await testInfo.attach("home", { path: testInfo.outputPath("home.png"), contentType: "image/png" });
  });

  test("bottom tab nav is visible on mobile only", async ({ page, viewport }, testInfo) => {
    await page.goto("/");
    const bottomNav = page.locator(".bottom-nav");
    if (viewport && viewport.width < 900) {
      await expect(bottomNav).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("home-bottom-nav.png"), fullPage: false });
      await testInfo.attach("home-bottom-nav", { path: testInfo.outputPath("home-bottom-nav.png"), contentType: "image/png" });
    } else {
      await expect(bottomNav).not.toBeVisible();
    }
  });

  test("slash shortcut opens search modal", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.keyboard.press("/");
    const input = page.locator("#globalSearchInput");
    await expect(input).toBeVisible();
    await input.fill("petro");
    await page.waitForResponse((r) => r.url().includes("/api/search"));
    await expect(page.locator("#globalSearchResults .search-item").first()).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: testInfo.outputPath("search-modal.png"), fullPage: false });
    await testInfo.attach("search-modal", { path: testInfo.outputPath("search-modal.png"), contentType: "image/png" });
  });

  test("global search button in top bar opens modal", async ({ page }) => {
    await page.goto("/");
    await page.click("#globalSearchBtn");
    await expect(page.locator("#globalSearchInput")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#searchModal")).toBeHidden();
  });

  test("theme toggle switches data-theme", async ({ page }, testInfo) => {
    await page.goto("/");
    const initial = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    await page.click("#themeToggleBtn");
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
    expect(after).not.toBe(initial);

    await page.screenshot({ path: testInfo.outputPath("home-dark.png"), fullPage: false });
    await testInfo.attach("home-dark", { path: testInfo.outputPath("home-dark.png"), contentType: "image/png" });
  });
});
