const { test, expect } = require("@playwright/test");

test.describe("Favorites page", () => {
  test("loads and shows empty state", async ({ page }, testInfo) => {
    await page.goto("/favorites.html");
    await expect(page).toHaveTitle(/Meus favoritos/);
    await page.screenshot({
      path: testInfo.outputPath("favorites-empty.png"),
      fullPage: false,
    });
    await testInfo.attach("favorites-empty", { path: testInfo.outputPath("favorites-empty.png"), contentType: "image/png" });
  });

  test("shows favorited tickers from localStorage", async ({ page }, testInfo) => {
    await page.goto("/favorites.html");
    await page.evaluate(() => {
      localStorage.setItem("stockFavorites", JSON.stringify({ PETR4: "Petrobras PN", VALE3: "Vale" }));
    });
    await page.reload();
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: testInfo.outputPath("favorites-populated.png"),
      fullPage: false,
    });
    await testInfo.attach("favorites-populated", { path: testInfo.outputPath("favorites-populated.png"), contentType: "image/png" });
  });
});
