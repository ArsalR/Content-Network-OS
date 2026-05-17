import { test, expect } from "@playwright/test";

test.describe("Keywords", () => {
  test("keywords route redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/projects/test-id/keywords");
    await expect(page).toHaveURL(/login/);
  });
});
