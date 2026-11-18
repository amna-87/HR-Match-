// Accessibility pass (spec 10 / M10): no serious or critical axe-core violations
// (labels, contrast, names, landmarks) on the main pages for each role.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function audit(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = serious.map(
    (v) =>
      `${v.id}: ${v.help} -> ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
  expect(summary, `${path}\n${summary.join("\n")}`).toEqual([]);
}

test("public pages", async ({ page }) => {
  for (const path of [
    "/",
    "/jobs",
    "/jobs?q=accountant&mode=onsite",
    "/jobs/00000000-0000-4000-8000-00000000f101",
    "/login",
    "/signup",
    "/takedown",
    "/terms",
    "/privacy",
    "/about",
    "/how-matching-works",
    "/for-recruiters",
    "/jobs/00000000-0000-4000-8000-00000000f003",
    "/companies/northwind-traders",
  ]) {
    await audit(page, path);
  }
});

test("candidate pages", async ({ page }) => {
  await login(page, "priya@example.test");
  for (const path of ["/candidate", "/candidate/profile", "/candidate/settings", "/candidate/privacy"])
    await audit(page, path);
});

test("recruiter pages", async ({ page }) => {
  await login(page, "rita@acme.example.test");
  for (const path of [
    "/recruiter",
    "/recruiter/jobs/new",
    "/recruiter/jobs/00000000-0000-4000-8000-00000000f001",
    "/recruiter/company",
    "/recruiter/sources",
    "/recruiter/jobs/add",
    "/recruiter/talent",
    "/recruiter/talent?job=00000000-0000-4000-8000-00000000f001",
  ]) {
    await audit(page, path);
  }
});

test("admin pages", async ({ page }) => {
  await login(page, "admin@example.test");
  for (const path of [
    "/admin",
    "/admin/users",
    "/admin/jobs",
    "/admin/sourced/new",
    "/admin/takedowns",
    "/admin/audit",
  ]) {
    await audit(page, path);
  }
});

test("dark theme pages", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  for (const path of ["/", "/jobs", "/jobs/00000000-0000-4000-8000-00000000f003", "/for-recruiters", "/login"])
    await audit(page, path);
  await login(page, "rita@acme.example.test");
  for (const path of ["/recruiter", "/recruiter/talent", "/recruiter/jobs/00000000-0000-4000-8000-00000000f001"])
    await audit(page, path);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
});
