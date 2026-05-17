import { test, expect } from "@playwright/test";

test.describe("Sites", () => {
  test("sites route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/sites");
    await expect(page).toHaveURL(/login/);
  });

  test("new site route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/sites/new");
    await expect(page).toHaveURL(/login/);
  });
});
