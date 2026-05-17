import { test, expect } from "@playwright/test";

test.describe("Publish flow (unauthenticated guards)", () => {
  test("drafts kanban redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/drafts");
    await expect(page).toHaveURL(/login/);
  });

  test("draft editor redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/drafts/some-draft-id");
    await expect(page).toHaveURL(/login/);
  });

  test("analytics redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page).toHaveURL(/login/);
  });
});
