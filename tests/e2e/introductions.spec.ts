// C1 + D-026: matches from your pool on the job page; anonymous network cards;
// an introduction is released only after the uploading recruiter confirms the
// person agreed.
import { test, expect, type Page } from "@playwright/test";
import { minimalPdf } from "../fixtures/minimal-pdf";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("network introduction: anonymous card, owner confirms consent, details released", async ({ browser }) => {
  const stamp = Date.now();
  const letters = String(stamp)
    .slice(-6)
    .split("")
    .map((d) => String.fromCharCode(97 + Number(d)))
    .join("");
  const name = `Nadia Accountant${letters}`;

  // Acme: share anonymously and add an accountant to the pool
  const rita = await (await browser.newContext()).newPage();
  await login(rita, "rita@acme.example.test");
  await rita.goto("/recruiter/company");
  await rita.getByLabel(/Share anonymous cards/).check();
  await rita.getByRole("button", { name: "Save" }).click();
  await rita.goto("/recruiter/talent");
  await rita.getByLabel("Resume files").setInputFiles({
    name: "nadia.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(
      minimalPdf([
        name,
        "Senior Financial Accountant",
        `nadia${stamp}@example.test | +92 21 ${String(stamp).slice(-7)} | Karachi, Pakistan`,
        "Financial Accountant at Ledgerline (2015 - present)",
        "Skills: IFRS, financial reporting, audit, excel, budgeting",
      ]),
    ),
  });
  await rita.getByLabel(/These people gave us their resume/).check();
  await rita.getByRole("button", { name: "Upload" }).click();
  await expect(rita.getByRole("status")).toContainText(/Added 1 profile/, { timeout: 30_000 });

  // Globex: the job page ranks the network; the card is anonymous
  const gary = await (await browser.newContext()).newPage();
  await login(gary, "gary@globex.example.test");
  await gary.goto("/recruiter/jobs/00000000-0000-4000-8000-00000000f003");
  await expect(gary.getByRole("heading", { name: "Top matches from your pool" })).toBeVisible();
  const network = gary.locator("#network");
  await expect(network).toBeVisible();
  await expect(network.getByText(name)).toHaveCount(0);
  const card = network
    .getByRole("listitem")
    .filter({ hasText: "Senior Financial Accountant" })
    .filter({
      has: gary.getByRole("button", { name: "Request introduction" }),
    })
    .first();
  await card.getByRole("textbox").fill("We think you'd enjoy this role.");
  await card.getByRole("button", { name: "Request introduction" }).click();
  await expect(gary.getByText(/Introduction requested/)).toBeVisible();

  // Acme sees the request and confirms the person agreed
  await rita.goto("/recruiter/talent");
  const req = rita.getByRole("listitem").filter({ hasText: name }).filter({ hasText: "Globex Financial" }).first();
  await expect(req).toBeVisible();
  await req.getByLabel(/The person agreed/).check();
  await req.getByRole("button", { name: "They agreed" }).click();
  await expect(rita.getByText(/The recruiter now sees the profile/)).toBeVisible();

  // Globex now sees the person
  await gary.goto("/recruiter/introductions");
  await gary.getByRole("link", { name }).click();
  await expect(gary.getByText(`nadia${stamp}@example.test`)).toBeVisible();
  await expect(gary.getByText("Private")).toHaveCount(0);
});
