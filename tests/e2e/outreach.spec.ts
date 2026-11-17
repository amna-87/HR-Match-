// C2 done-when (launch scope): from a job, select 5 matched pool candidates,
// send the opportunity (copy messages), and an address that opted out can no
// longer be contacted by anyone.
import { test, expect } from "@playwright/test";

test("send an opportunity to 5 people; opt-out blocks them afterwards", async ({ page, context }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("rita@acme.example.test");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));

  await page.goto("/recruiter/jobs/00000000-0000-4000-8000-00000000f001");
  await expect(page.getByRole("heading", { name: "Top matches from your pool" })).toBeVisible();
  const boxes = page.locator('input[name="pool_ids"]:not([disabled])');
  expect(await boxes.count()).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < 5; i++) await boxes.nth(i).check();
  await page.getByRole("button", { name: "Send this opportunity to selected" }).click();
  await expect(page.getByRole("heading", { name: "Send this opportunity" })).toBeVisible();

  // lawful basis is required
  await page.getByRole("button", { name: "Show messages to copy" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /lawful basis/ })).toBeVisible();
  await page.getByLabel(/I have a lawful basis/).check();
  await page.getByRole("button", { name: "Show messages to copy" }).click();
  const list = page.getByRole("status");
  await expect(list.getByRole("listitem")).toHaveCount(5);
  const firstSendable = list
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /Copy message/ }) })
    .first();
  const msg = await firstSendable.locator("pre").textContent();
  expect(msg).toContain("Why you're getting this");
  const stopUrl = msg!.match(/https?:\/\/\S+\/stop\/\S+/)![0];
  const person = (await firstSendable.locator("p").first().textContent())!.split(" · ")[0].trim();

  // the person opts out (one click)
  const other = await context.browser()!.newContext();
  const p2 = await other.newPage();
  await p2.goto(stopUrl.replace(/^https?:\/\/[^/]+/, ""));
  await p2.getByRole("button", { name: "Stop all recruiter messages" }).click();
  await expect(p2.getByRole("heading", { name: /won't hear from recruiters/ })).toBeVisible();

  // nobody can contact them again
  await page.reload();
  await page.getByLabel(/I have a lawful basis/).check();
  await page.getByRole("button", { name: "Show messages to copy" }).click();
  await expect(
    page
      .getByRole("status")
      .getByRole("listitem")
      .filter({ hasText: person })
      .getByText(/Left out: unsubscribed/),
  ).toBeVisible();
});
