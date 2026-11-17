// B1 (addendum 4, 7c): a recruiter adds a job from another source with no
// company and only a WhatsApp number; it stays in their workspace until an
// admin approves it for the public board; anonymous visitors see the number
// masked and reveal it after a human check.
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password = "Password123!") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("job from another source: workspace first, public after review, contact protected", async ({ browser }) => {
  const title = `Sales Executive ${Date.now()}`;
  const rita = await (await browser.newContext()).newPage();
  await login(rita, "rita@acme.example.test");
  await rita.goto("/recruiter/jobs/add");
  await rita.getByLabel("Title").fill(title);
  await rita.getByLabel(/Summary/).fill("Field sales role selling software to small shops. Targets and commission.");
  await rita.getByLabel("Location").fill("Lahore, Pakistan");
  await rita.getByLabel("Apply via").selectOption("whatsapp");
  await rita.getByLabel(/Apply link \/ email \/ phone/).fill("+92 300 7654321");
  await rita.getByRole("button", { name: "Publish" }).click();
  // earlier runs created similar jobs: duplicate detection asks first
  const dup = rita.getByLabel(/Publish anyway/);
  await expect(dup.or(rita.getByText("Only your workspace sees this job"))).toBeVisible();
  if (await dup.isVisible()) {
    await dup.check();
    await rita.getByRole("button", { name: "Publish" }).click();
  }
  await expect(rita.getByText("Only your workspace sees this job")).toBeVisible();
  await expect(rita.getByText("Source: not specified").first()).toBeVisible();
  const jobUrl = rita.url().replace("/recruiter/jobs/", "/jobs/");

  // not public yet
  const anon = await (await browser.newContext()).newPage();
  const r = await anon.goto(jobUrl);
  expect(r?.status()).toBe(404);

  await rita.getByRole("button", { name: "Ask for the public board" }).click();
  await expect(rita.getByText(/Waiting for review|A Vouch admin will review/).first()).toBeVisible();

  // admin approves
  const admin = await (await browser.newContext()).newPage();
  await login(admin, "admin@example.test");
  await admin.goto("/admin/jobs");
  await admin
    .getByRole("listitem")
    .filter({ hasText: title })
    .getByRole("button", { name: "Put on public board" })
    .click();
  await expect(admin.getByText("Job is now on the public board.")).toBeVisible();

  // anonymous: company shows "Hiring directly", number masked, revealed after the check
  await anon.goto(jobUrl);
  await expect(anon.getByRole("heading", { name: title })).toBeVisible();
  await expect(anon.getByText("Hiring directly").first()).toBeVisible();
  await expect(anon.getByText("Source: not specified.")).toBeVisible();
  expect(await anon.content()).not.toContain("7654321");
  const q = await anon.getByText(/Quick check to show the contact/).textContent();
  const [a, b] = q!.match(/\d+/g)!.map(Number);
  await anon.getByLabel(/Quick check/).fill(String(a + b));
  await anon.getByRole("button", { name: "Show contact" }).click();
  await expect(anon.getByRole("link", { name: "Apply via WhatsApp" })).toHaveAttribute("href", /wa\.me\/923007654321/);
});
