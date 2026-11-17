// Profile button in the header: opens a menu with the account pages and sign out.
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password = "Password123!") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("profile menu shows account links, closes on Escape, and signs out", async ({ page }) => {
  await login(page, "maya@example.test");
  const button = page.getByRole("button", { name: /account menu/ });
  await button.click();
  const menu = page.getByRole("menu", { name: "Account" });
  await expect(menu.getByText("maya@example.test")).toBeVisible();
  await expect(menu.getByText("Job seeker")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await button.click();
  await menu.getByRole("menuitem", { name: "Privacy & my data" }).click();
  await expect(page).toHaveURL(/\/candidate\/privacy$/);
  await expect(page.getByRole("menu", { name: "Account" })).toHaveCount(0); // closes after navigating

  await button.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Log in" }).first()).toBeVisible();
});

test("profile button is available on phones too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "rita@acme.example.test");
  await page.getByRole("button", { name: /account menu/ }).click();
  await expect(page.getByRole("menuitem", { name: "Company profile & team" })).toBeVisible();
});
