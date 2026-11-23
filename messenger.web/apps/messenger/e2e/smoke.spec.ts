import { expect, test } from "@playwright/test";

test.describe("DIO Messenger smoke", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /DIO Messenger/i })).toBeVisible();
    await expect(page.getByLabel(/Email/i)).toBeVisible();
  });
});