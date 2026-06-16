import { test, expect } from "@playwright/test";

/**
 * Basic smoke tests that run against a deployed environment. The full
 * signup → checkout → dashboard → letter flow requires a Stripe test
 * account and a working auth provider, which is environment-specific.
 * We keep this suite narrow to catch regressions on the public surface.
 */

test.describe("Public surface smoke", () => {
  test("landing page renders the primary CTA", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /see every site/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /start.*free trial|create account/i })).toBeVisible();
  });

  test("pricing page shows at least one plan", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.locator("body")).toContainText(/month|Pro|Starter/i);
  });

  test("auth sign-in route is reachable", async ({ page }) => {
    const res = await page.goto("/auth/sign-in");
    expect(res?.status()).toBeLessThan(500);
  });
});
