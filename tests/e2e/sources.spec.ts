// B2: CSV import with column mapping into the recruiter's workspace; rows are
// checked one by one (a row without a way to apply is reported, not imported).
import { test, expect } from "@playwright/test";

test("CSV import: map columns, preview, per-row results", async ({ page }) => {
  const stamp = Date.now();
  await page.goto("/login");
  await page.getByLabel("Email").fill("rita@acme.example.test");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/recruiter/sources");
  const csv = [
    "Position;Employer;City;Email;WhatsApp;Notes",
    `Warehouse Supervisor ${stamp};Northwind;Karachi;jobs@northwind.example.test;;Night shifts`,
    `Delivery Rider ${stamp};;Lahore;;+92 300 1112233;Own bike`,
    `Mystery Role ${stamp};Nowhere;;;;no contact`,
  ].join("\n");
  await page.getByLabel("CSV file").setInputFiles({ name: "jobs.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("Preview of the first 3 of 3 rows")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Hiring directly" })).toBeVisible();
  await page.getByLabel("Import jobs that look like duplicates").check();
  await page.getByRole("button", { name: "Import 3 jobs" }).click();
  await expect(page.getByText("Imported 2 of 3 rows.")).toBeVisible();
  await expect(page.getByText(/Row 4: Mystery Role .*Not added: Add the apply link, email or number/)).toBeVisible();
  await page.goto("/recruiter");
  await expect(page.getByRole("link", { name: `Delivery Rider ${stamp}` })).toBeVisible();
});
