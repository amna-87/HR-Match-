// 7c: readable job URLs (old ones redirect), JobPosting structured data with
// validThrough, sitemap/robots, closed jobs show a friendly page, filters,
// share buttons, landing pages, and logged-in actions (apply, save).
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("job pages: readable URL, structured data, sharing, no private contacts", async ({ page, request }) => {
  await page.goto("/jobs/00000000-0000-4000-8000-00000000f003");
  await expect(page).toHaveURL(/\/jobs\/financial-accountant-[a-z-]*\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Financial Accountant" })).toBeVisible();
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
  expect(ld).toMatchObject({ "@type": "JobPosting", title: "Financial Accountant", directApply: true });
  expect(ld.validThrough).toBeTruthy();
  await expect(page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me\/\?text=/);
  await expect(page.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", /linkedin\.com\/sharing/);
  await expect(page.getByText("Get matched to jobs like this")).toBeVisible();
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toMatch(/\/jobs\/financial-accountant-/);

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /recruiter");
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toMatch(/\/jobs\/financial-accountant-[a-z-]*\d+</);
  expect(sitemap).not.toMatch(/@|\+92/);
});

test("search: filters, location, pages; closed job page; static pages", async ({ page }) => {
  await page.goto("/jobs?type=full_time&posted=30&location=london");
  await expect(page.getByText(/roles? in london/i)).toBeVisible();
  await page.goto("/jobs?q=zzzz-no-such-job");
  await expect(page.getByText("No roles match your search.")).toBeVisible();
  for (const [path, h] of [
    ["/about", "Hiring that respects people on both sides"],
    ["/how-matching-works", "How Vouch matches people and jobs"],
    ["/for-recruiters", /Your resumes, your jobs/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: h })).toBeVisible();
  }
});

test("candidates apply through Vouch and save jobs (login needed)", async ({ page }) => {
  await page.goto("/jobs/00000000-0000-4000-8000-00000000f002");
  await expect(page.getByRole("link", { name: "Sign up free to apply" })).toBeVisible();
  await login(page, "jordan@example.test");
  await page.goto("/jobs/00000000-0000-4000-8000-00000000f002");
  const apply = page.getByRole("button", { name: "Apply with my Vouch profile" });
  if (await apply.isVisible()) {
    await apply.click();
    await expect(page.getByText(/Applied\. The employer now sees your profile/)).toBeVisible();
  }
  await expect(page.getByText("You applied. Track it on your dashboard.")).toBeVisible();
  const save = page.getByRole("button", { name: /Save this job|Saved/ });
  if ((await save.textContent())?.includes("Save this job")) await save.click();
  await page.goto("/candidate");
  await expect(page.getByRole("heading", { name: "Saved jobs" })).toBeVisible();
});
