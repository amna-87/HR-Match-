// D-037: create the workspace's job inbox, post a forwarded email to it, and the
// job appears as a draft in the recruiter's jobs.
import { test, expect } from "@playwright/test";

test("forward-by-email: email in, draft job out", async ({ page, request }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("rita@acme.example.test");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/recruiter/sources");
  await page.getByRole("button", { name: /Create my inbox address|Reset address/ }).click();
  await expect(page.getByText("Your job inbox address is ready.")).toBeVisible();
  const url = (await page.locator("code").filter({ hasText: "/api/inbound/jobs/" }).textContent())!.trim();
  const title = `Night Shift Supervisor ${Date.now()}`;
  const res = await request.post(url.replace(/^https?:\/\/[^/]+/, ""), {
    data: {
      subject: `Fwd: ${title}`,
      text: `${title}\nLocation: Multan\nApply: jobs@warehouse.example.test`,
      from: "x@y.z",
    },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).created).toBeTruthy();
  await page.goto("/recruiter");
  await expect(page.getByRole("listitem").filter({ hasText: title }).getByText("draft")).toBeVisible();
});
