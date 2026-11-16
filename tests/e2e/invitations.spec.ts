// Recruiter seats: a company admin invites a new colleague by email; they sign up
// as a recruiter with that address, accept, and land in the company. Also checks
// that a job's "how to apply" next steps are shown publicly.
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password = "Password123!") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("invite a recruiter, who signs up and accepts", async ({ browser }) => {
  const email = `newhire${Date.now()}@example.test`;
  const admin = await (await browser.newContext()).newPage();
  await login(admin, "rita@acme.example.test");
  await admin.goto("/recruiter/company");
  await admin.getByLabel("Invite by email").fill(email);
  await admin.getByRole("button", { name: "Send invitation" }).click();
  await expect(admin.getByText(/Invitation (sent|created)/)).toBeVisible();
  await expect(admin.getByText(`${email} · recruiter`)).toBeVisible();

  const invitee = await (await browser.newContext()).newPage();
  await invitee.goto(`/signup?role=recruiter&email=${encodeURIComponent(email)}`);
  await expect(invitee.getByLabel("Email")).toHaveValue(email);
  await invitee.getByLabel("Full name").fill("New Hire");
  await invitee.getByLabel("Password").fill("Password123!longer");
  await invitee.getByRole("checkbox").check();
  await invitee.getByRole("button", { name: "Create account" }).click();
  await invitee.waitForURL(/\/login/);
  await login(invitee, email, "Password123!longer");
  await expect(invitee.getByText("You've been invited")).toBeVisible();
  await invitee.getByRole("button", { name: "Accept" }).click();
  await expect(invitee.getByText("You've joined the company.")).toBeVisible();
  await expect(invitee.getByRole("heading", { name: /Acme Social · Jobs/ })).toBeVisible();

  await admin.reload();
  await expect(admin.getByText(`${email} · recruiter`)).toBeVisible(); // now a member
  await expect(admin.getByText("Pending invitations")).toHaveCount(0);
});

test("a job's next steps are shown on the job page", async ({ page }) => {
  await login(page, "rita@acme.example.test");
  await page.goto("/recruiter/jobs/00000000-0000-4000-8000-00000000f001");
  await page.getByLabel("Next steps for applicants (optional)").fill("We reply within 5 working days.");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page.getByText("Job saved.")).toBeVisible();
  await page.goto("/jobs/00000000-0000-4000-8000-00000000f001");
  await expect(page.getByText("What happens after you apply")).toBeVisible();
  await expect(page.getByText("We reply within 5 working days.")).toBeVisible();
});
