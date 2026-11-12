// More E2E flows: resume upload fallback, email-link decline, sourced job
// duplicate detection, takedown. Needs DATABASE_URL + TOKEN_SIGNING_SECRET of the running app.
import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import { signToken } from "../../src/lib/consent/tokens";
import { minimalPdf } from "../fixtures/minimal-pdf";

const PASSWORD = "Password123!";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
test.afterAll(async () => db.end());

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("resume upload is stored privately; parse failure falls back to manual entry", async ({ page }) => {
  await login(page, "jordan@example.test");
  await page.goto("/candidate/profile");
  await page.getByLabel("Resume file").setInputFiles({
    name: "jordan-cv.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      minimalPdf([
        "Jordan Alvarez",
        "Digital marketing specialist with social media and Google Ads experience over three years.",
      ]),
    ),
  });
  await page.getByRole("button", { name: "Upload" }).click();
  // No ANTHROPIC_API_KEY in the E2E env -> graceful fallback
  // Text extraction worked; only the AI step is unavailable -> graceful fallback
  await expect(
    page.getByRole("alert").filter({
      hasText: "Automatic parsing is unavailable right now. Your file is saved — please fill in your profile below.",
    }),
  ).toBeVisible();
  await expect(page.getByText("jordan-cv.pdf").first()).toBeVisible();
  await expect(page.getByLabel("Headline")).toBeVisible();
  const r = await db.query(
    "select o.name from storage.objects o where o.bucket_id = 'resumes' and o.name like '00000000-0000-4000-8000-000000000202/%'",
  );
  expect(r.rows.length).toBeGreaterThan(0);
  // Editing manually works
  await page.getByLabel("Headline").fill("Performance Marketing Specialist");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
});

test("one-click decline from an email link", async ({ page }) => {
  const cand = (await db.query("select id from candidates where user_id = '00000000-0000-4000-8000-000000000204'"))
    .rows[0].id; // Sam
  const job = "00000000-0000-4000-8000-00000000f002";
  await db.query("delete from matches where job_id = $1 and candidate_id = $2 and status in ('suggested','notified')", [
    job,
    cand,
  ]);
  const existing = (
    await db.query("select id, status from matches where job_id = $1 and candidate_id = $2", [job, cand])
  ).rows[0];
  test.skip(!!existing, "already answered in a previous run");
  const m = (
    await db.query("select public.upsert_match($1, $2, 88, '{}', 'Matched on: typescript, node.js.', false) id", [
      job,
      cand,
    ])
  ).rows[0].id;
  await db.query("select public.mark_match_notified($1)", [m]);
  const token = signToken("match_decline", m, cand, new Date(Date.now() + 86400_000));
  await page.goto(`/m/${token}`);
  await expect(page.getByText("Matched on: typescript, node.js.")).toBeVisible();
  await page.getByRole("button", { name: "Decline this match" }).click();
  await expect(page.getByText("Declined. We won't ask you about this job again.")).toBeVisible();
  expect((await db.query("select status from matches where id = $1", [m])).rows[0].status).toBe("declined");
  // the same link can't be reused to change the answer, and a forged approve fails
  const forged = token.replace(
    /^[^.]+/,
    Buffer.from(JSON.stringify({ p: "match_approve", s: m, c: cand, e: 9999999999, n: "x" })).toString("base64url"),
  );
  await page.goto(`/m/${forged}`);
  await expect(page.getByText("This link is invalid.")).toBeVisible();
});

test("admin adds a sourced job (duplicate detection), then a takedown removes a listing", async ({ browser }) => {
  const admin = await (await browser.newContext()).newPage();
  await login(admin, "admin@example.test");
  await expect(admin).toHaveURL(/\/admin/);
  await admin.goto("/admin/sourced/new");
  await admin.getByLabel("Title").fill("Content Writer");
  await admin
    .getByLabel("Summary (in our own words)")
    .fill("Remote content writer for blog articles, newsletters and social copy.");
  await admin.getByLabel("Required skills").fill("copywriting");
  await admin.getByLabel("Source name").fill("Northwind careers page");
  await admin.getByLabel("Source URL").fill("https://careers.northwind.example.test/jobs/content-writer-2");
  await admin.getByLabel("Hiring company").fill("Northwind Traders");
  await admin.getByLabel("Apply link / email / phone").fill("jobs@northwind.example.test");
  await admin.getByLabel("Apply via").selectOption("email");
  await admin.getByLabel("Work mode").selectOption("remote");
  await admin.getByRole("button", { name: "Publish" }).click();
  await expect(admin.getByText("This looks like a duplicate.")).toBeVisible();
  await expect(admin.getByLabel("Title")).toHaveValue("Content Writer"); // form kept
  await admin.getByLabel("Publish anyway (not a duplicate)").check();
  await admin.getByRole("button", { name: "Publish" }).click();
  await expect(admin.getByText("Sourced job published.")).toBeVisible();
  const created = (
    await db.query(
      "select id, expires_at, status from jobs where source_url = 'https://careers.northwind.example.test/jobs/content-writer-2' order by created_at desc limit 1",
    )
  ).rows[0];
  expect(created.status).toBe("published");
  const days = (new Date(created.expires_at).getTime() - Date.now()) / 86400_000;
  expect(days).toBeGreaterThan(29);
  expect(days).toBeLessThan(31);

  // Public takedown request for that listing
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/jobs/${created.id}`);
  await expect(visitor.getByText("Sourced from Northwind careers page.")).toBeVisible();
  await visitor.getByRole("link", { name: "Request removal", exact: true }).click();
  await visitor.getByLabel("Your contact (email or phone)").fill("legal@northwind.example.test");
  await visitor.getByLabel("Reason").fill("Please remove this duplicate listing.");
  await visitor.getByRole("button", { name: "Send request" }).click();
  await expect(visitor.getByText("we've received your request")).toBeVisible();

  // Admin honours it
  await admin.goto("/admin/takedowns");
  const card = admin.locator("div.rounded-lg", { hasText: "legal@northwind.example.test" }).first();
  await card.getByLabel("Note").fill("Owner request");
  await card.getByRole("button", { name: "Remove listing" }).click();
  await expect(admin.getByText("Listing removed and request resolved.")).toBeVisible();
  expect((await db.query("select status from jobs where id = $1", [created.id])).rows[0].status).toBe("removed");
  const audit = await db.query("select action from audit_log where entity_id = $1 or action like 'takedown.%'", [
    created.id,
  ]);
  expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["job.status_changed", "takedown.resolved"]));
  const gone = await visitor.goto(`/jobs/${created.id}`);
  expect(gone?.status()).toBe(404);
});
