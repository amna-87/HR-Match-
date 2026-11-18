// D-036: a recruiter adds a picture of the job post; it is shown on the public
// job page to everyone only when marked free of personal contacts.
import { test, expect } from "@playwright/test";

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("job picture: upload, mark public, shown on the job page", async ({ page, browser }) => {
  const title = `Barista ${Date.now()}`;
  await page.goto("/login");
  await page.getByLabel("Email").fill("rita@acme.example.test");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/recruiter/jobs/new");
  await page
    .getByLabel(/Or upload a picture of the job post/)
    .setInputFiles({ name: "flyer.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Upload picture" }).click();
  await expect(page.getByRole("heading", { name: "Job picture" })).toBeVisible();
  await page.getByLabel(/This picture shows no personal phone numbers/).check();
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Make great coffee for our customers in a busy cafe.");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("heading", { name: new RegExp(title) })).toBeVisible();

  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/jobs?q=${encodeURIComponent(title)}`);
  await anon.getByRole("link", { name: title }).click();
  const img = anon.getByRole("img", { name: `Job post picture: ${title}` });
  await expect(img).toBeVisible();
  expect(await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1);
});
