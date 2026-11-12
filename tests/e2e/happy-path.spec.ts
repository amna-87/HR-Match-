// E2E happy path (Section 14): recruiter posts job -> candidate gets match ->
// approves -> recruiter sees applicant. Uses seeded accounts (supabase/seed.sql).
import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "Password123!";
const title = `Paid Social Lead ${Date.now().toString().slice(-6)}`;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("recruiter posts a job, candidate approves, recruiter sees the applicant", async ({ browser }) => {
  // 1. Recruiter posts and publishes a job
  const recruiter = await (await browser.newContext()).newPage();
  await login(recruiter, "rita@acme.example.test");
  await expect(recruiter).toHaveURL(/\/recruiter/);
  await recruiter.goto("/recruiter/jobs/new");
  await recruiter.getByLabel("Title").fill(title);
  await recruiter
    .getByLabel("Description")
    .fill("Lead paid and organic social media marketing: Meta Ads campaigns, content strategy and community.");
  await recruiter.getByLabel("Required skills").fill("social media marketing, meta ads, content strategy");
  await recruiter.getByLabel("Nice-to-have skills").fill("tiktok, copywriting");
  await recruiter.getByLabel("Domains").fill("marketing, social media");
  await recruiter.getByLabel("Min experience (years)").fill("3");
  await recruiter.getByLabel("Work mode").selectOption("remote");
  await recruiter.getByRole("button", { name: "Publish" }).click();
  await recruiter.waitForURL(/\/recruiter\/jobs\/[0-9a-f-]{36}/);
  const jobUrl = recruiter.url().split("?")[0];
  await expect(recruiter.getByText("Job published. Matching has started.")).toBeVisible();
  // Before anyone consents, the pipeline is empty
  await expect(recruiter.getByRole("heading", { name: "Applicants (0)" })).toBeVisible();

  // 2. Candidate gets the match (matching + notify run in the background)
  const candidate = await (await browser.newContext()).newPage();
  await login(candidate, "maya@example.test");
  await expect(candidate).toHaveURL(/\/candidate/);
  await expect(async () => {
    await candidate.reload();
    await expect(candidate.getByRole("link", { name: title })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 45_000 });
  const card = candidate.locator("div.rounded-lg", { has: candidate.getByRole("link", { name: title }) });
  await expect(card.getByText(/Matched on: .*meta ads/i)).toBeVisible();

  // Still invisible to the recruiter until approved
  await recruiter.reload();
  await expect(recruiter.getByText("Maya Chen")).toHaveCount(0);

  // 3. Candidate approves
  await card.getByRole("button", { name: "Approve & apply" }).click();
  await expect(candidate.getByText("Application sent.")).toBeVisible();
  const apps = candidate.locator("section", { has: candidate.getByRole("heading", { name: "Your applications" }) });
  await expect(apps.getByRole("listitem").filter({ hasText: title })).toContainText("new");

  // 4. Recruiter sees the applicant, ranked with score + explanation
  await recruiter.goto(jobUrl);
  await expect(recruiter.getByRole("link", { name: "Maya Chen" })).toBeVisible();
  await expect(recruiter.getByRole("heading", { name: /Applicants \(1\)/ })).toBeVisible();
  // Other matched candidates who did not approve are not listed
  await expect(recruiter.getByText("Jordan Alvarez")).toHaveCount(0);

  // Recruiter opens the application and moves it forward
  await recruiter.getByRole("link", { name: "Maya Chen" }).click();
  await expect(recruiter.getByRole("heading", { name: "Maya Chen" })).toBeVisible();
  await recruiter.getByLabel("Stage").selectOption("interview");
  await recruiter.getByRole("button", { name: "Update" }).click();
  await expect(recruiter.getByText("Stage updated.")).toBeVisible();
  await expect(recruiter.getByText("new → interview")).toBeVisible();
});

test("each role lands on its own dashboard and can't open the others", async ({ page }) => {
  await login(page, "maya@example.test");
  await expect(page).toHaveURL(/\/candidate$/);
  await page.goto("/recruiter");
  await expect(page).toHaveURL(/\/candidate$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/candidate$/);
});

test("sourced jobs are clearly labeled and link to the original listing", async ({ page }) => {
  await page.goto("/jobs");
  const seeded = page.locator('a[href="/jobs/00000000-0000-4000-8000-00000000f101"]');
  await expect(page.locator("div.rounded-lg", { has: seeded }).getByText("Sourced listing")).toBeVisible();
  await seeded.click();
  await expect(page.getByText("Sourced from Northwind careers page. Apply via the original listing.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Apply via the original listing" })).toHaveAttribute("href", /northwind/);
  await expect(page.getByRole("link", { name: "Request removal", exact: true })).toBeVisible();
});
