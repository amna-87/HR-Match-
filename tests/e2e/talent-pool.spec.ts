// Talent pool (D-022, D-026): a recruiter uploads a resume; their workspace sees it in
// full, another workspace only an anonymous card once sharing is on; the person signs up with the
// same email and adds it to their profile; the uploader keeps the entry, marked "On Vouch".
// Also: jobs are public (home page + /jobs search) without an account.
import { test, expect, type Page } from "@playwright/test";
import { minimalPdf } from "../fixtures/minimal-pdf";

async function login(page: Page, email: string, password = "Password123!") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("jobs are public: home page and search work without an account", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Latest jobs" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Latest jobs" }).getByRole("listitem").first()).toBeVisible();
  await page.goto("/jobs?q=accountant");
  await expect(page.getByRole("link", { name: "Financial Accountant" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Senior Backend Engineer (TypeScript)" })).toHaveCount(0);
});

test("upload, anonymous to others, claimed by the person", async ({ browser }) => {
  const stamp = Date.now();
  const email = `pat${stamp}@example.test`;
  const letters = String(stamp)
    .slice(-6)
    .split("")
    .map((d) => String.fromCharCode(97 + Number(d)))
    .join("");
  const name = `Pat Talent${letters}`;

  // 1. Acme uploads a resume
  const rita = await (await browser.newContext()).newPage();
  await login(rita, "rita@acme.example.test");
  await rita.goto("/recruiter/talent");
  await rita.getByLabel("Resume files").setInputFiles({
    name: "pat.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      minimalPdf([
        name,
        "Social Media Manager",
        `${email} | +44 20 ${String(stamp).slice(-8)}`,
        "9 years of experience in social media marketing, Meta Ads, content strategy and copywriting.",
        "Led paid social campaigns and community management for consumer brands.",
      ]),
    ),
  });
  await rita.getByLabel(/These people gave us their resume/).check();
  await rita.getByRole("button", { name: "Upload" }).click();
  await expect(rita.getByRole("status")).toContainText(/Added 1 profile/, { timeout: 30_000 });
  await rita.reload();
  await expect(rita.getByRole("link", { name })).toBeVisible();

  // search: semantic and by skill
  await rita.getByLabel("Describe who you are looking for").fill("social media marketer with Meta Ads");
  await rita.getByRole("button", { name: "Search" }).click();
  await expect(rita.getByRole("link", { name })).toBeVisible();

  // full details on the profile page, resume downloadable
  await rita.getByRole("link", { name }).click();
  await expect(rita.getByText(email).first()).toBeVisible();
  await expect(rita.getByRole("link", { name: /Download resume/ })).toBeVisible();

  // 2. Pools are private by default; Acme opts in to anonymous sharing
  await rita.goto("/recruiter/company");
  await rita.getByLabel(/Share anonymous cards/).check();
  await rita.getByRole("button", { name: "Save" }).click();
  await expect(rita.getByText("Workspace updated.")).toBeVisible();

  // Globex: anonymous card only, when ranking for its own job
  const gary = await (await browser.newContext()).newPage();
  await login(gary, "gary@globex.example.test");
  await gary.goto("/recruiter/talent");
  await expect(gary.getByRole("link", { name })).toHaveCount(0);
  await gary.getByRole("button", { name: "Rank" }).click();
  await expect(gary.getByText("Anonymous profile").first()).toBeVisible();
  await expect(gary.getByText("Social Media Manager").first()).toBeVisible();
  await expect(gary.getByText(name)).toHaveCount(0);
  await expect(gary.getByText(email)).toHaveCount(0);

  // 3. The person signs up with the same email and adds the profile to their account
  const pat = await (await browser.newContext()).newPage();
  await pat.goto("/signup?role=candidate");
  await pat.getByLabel("Full name").fill(name);
  await pat.getByLabel("Email").fill(email);
  await pat.getByLabel("Password").fill("Password123!longer");
  await pat.getByRole("checkbox").check();
  await pat.getByRole("button", { name: "Create account" }).click();
  await pat.waitForURL(/\/login/);
  await login(pat, email, "Password123!longer");
  await expect(pat.getByText("A recruiter added a profile for you")).toBeVisible();
  await expect(pat.getByText("Acme Social")).toBeVisible();
  await pat.getByRole("button", { name: "Add to my profile" }).click();
  await expect(pat.getByText(/Added to your profile/)).toBeVisible();
  await expect(pat.getByLabel("Headline")).toHaveValue("Social Media Manager");

  // 4. Acme keeps its pool entry, now marked as on Vouch
  await rita.goto(`/recruiter/talent?q=${encodeURIComponent(email)}`);
  await expect(rita.getByRole("listitem").filter({ hasText: name }).getByText("On Vouch")).toBeVisible();
});

test("bulk upload: a ZIP of resumes, with a duplicate and a non-resume file", async ({ page }) => {
  const JSZip = (await import("jszip")).default;
  const stamp = Date.now();
  const zip = new JSZip();
  // unique per run (letters only, so they read as names) to avoid matching earlier runs
  const tag = String(stamp)
    .slice(-5)
    .split("")
    .map((d) => String.fromCharCode(97 + Number(d)))
    .join("");
  const person = (n: string, e: string) =>
    minimalPdf([
      n,
      "Accountant",
      `${e} | Karachi, Pakistan`,
      "Accountant at Ledger Co (2018 - present)",
      "Skills: bookkeeping, payroll, excel",
    ]);
  zip.file("cvs/one.pdf", person(`Hina Raza${tag}`, `hina${stamp}@example.test`));
  zip.file("cvs/two.pdf", person(`Omar Butt${tag}`, `omar${stamp}@example.test`));
  zip.file("cvs/two-again.pdf", person(`Omar Butt${tag}`, `omar${stamp}@example.test`));
  zip.file("cvs/notes.txt", "not a resume");
  const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));

  await login(page, "rita@acme.example.test");
  await page.goto("/recruiter/talent");
  await page.getByLabel("Resume files").setInputFiles({ name: "batch.zip", mimeType: "application/zip", buffer });
  await expect(page.getByText("notes.txt")).toBeVisible();
  await expect(page.getByText(/Skipped: not a PDF or DOCX/)).toBeVisible();
  await page.getByLabel(/These people gave us their resume/).check();
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("status")).toContainText(/Added 2 profiles\. 1 duplicate merged/, { timeout: 30_000 });
  await page.goto(`/recruiter/talent?skills=payroll&q=${stamp}`);
  await expect(page.getByText("2 matching profiles")).toBeVisible();
});
