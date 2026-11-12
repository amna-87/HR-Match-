import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb("profile");
});
afterAll(async () => db?.close());

const payload = {
  full_name: "Jordan A.",
  headline: "Growth Marketer",
  summary: "Performance marketing.",
  location: "Leeds, UK",
  contact_email: "jordan.contact@example.test",
  contact_phone: "",
  languages: ["English"],
  skills: ["Google Ads", "SEO", "seo"],
  experiences: [{ title: "Marketer", company: "Shop", start_date: "2021-01-01", end_date: "", is_current: true, description: "Ads." }],
  education: [{ institution: "Uni", degree: "BA", field: "Marketing", start_date: "", end_date: "" }],
  certifications: [{ name: "Google Ads Search", issuer: "Google" }],
  experience_years: 5.8,
};

describe("save_candidate_profile", () => {
  it("atomically replaces the caller's own profile rows", async () => {
    await db.as(IDS.jordan)("select save_candidate_profile($1::jsonb)", [JSON.stringify(payload)]);
    const cid = await db.candidateId(IDS.jordan);
    const c = await db.root("select full_name, headline, experience_years, needs_matching from candidates where id = $1", [cid]);
    expect(c.rows[0]).toMatchObject({ full_name: "Jordan A.", headline: "Growth Marketer", needs_matching: true });
    expect(Number(c.rows[0].experience_years)).toBeCloseTo(5.8);
    const skills = await db.root("select skill from candidate_skills where candidate_id = $1 order by skill", [cid]);
    expect(skills.rows.map((r) => r.skill)).toEqual(["Google Ads", "SEO"]);
    expect((await db.root("select count(*)::int n from experiences where candidate_id = $1", [cid])).rows[0].n).toBe(1);
    expect((await db.root("select count(*)::int n from certifications where candidate_id = $1", [cid])).rows[0].n).toBe(1);
  });

  it("can't touch anyone else (recruiters have no candidate profile)", async () => {
    await expect(db.as(IDS.rita)("select save_candidate_profile($1::jsonb)", [JSON.stringify(payload)])).rejects.toThrow(/no candidate profile/);
    await expect(db.anon("select save_candidate_profile($1::jsonb)", [JSON.stringify(payload)])).rejects.toThrow(/permission denied/);
  });

  it("does not let a candidate inject verified skills via the payload", async () => {
    await db.as(IDS.jordan)("select save_candidate_profile($1::jsonb)", [JSON.stringify({ ...payload, skills: ["leadership"] })]);
    const cid = await db.candidateId(IDS.jordan);
    const v = await db.root("select count(*)::int n from candidate_skills where candidate_id = $1 and source = 'verified'", [cid]);
    expect(v.rows[0].n).toBe(0);
  });
});
