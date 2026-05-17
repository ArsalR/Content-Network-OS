import { test, expect } from "@playwright/test";

test.describe("Projects", () => {
  test("projects route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/login/);
  });

  test("new project route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/projects/new");
    await expect(page).toHaveURL(/login/);
  });
});
