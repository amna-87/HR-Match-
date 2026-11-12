// M5 acceptance: on seeded realistic data, a "social media marketing" job
// ranks relevant candidates above unrelated ones; re-running is idempotent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, IDS, type TestDb } from "../helpers/db";
import { matchCandidate, matchJob, runPendingMatching, type EngineDeps } from "@/lib/matching/engine";
import { LocalEmbeddingProvider } from "@/lib/matching/embeddings";

let db: TestDb;
let deps: EngineDeps;
const name = new Map<string, string>();

beforeAll(async () => {
  db = await createTestDb("engine");
  deps = { db: db.pool, embedder: new LocalEmbeddingProvider(), threshold: 0 }; // threshold 0 to inspect full ranking
  const r = await db.root("select id, full_name from candidates");
  for (const row of r.rows) name.set(row.id, row.full_name);
});
afterAll(async () => db?.close());

describe("ranking on seeded data", () => {
  it("ranks marketers above unrelated profiles for the social media job", async () => {
    const res = await matchJob(deps, IDS.jobSocial);
    const ranked = res.matches.map((m) => name.get(m.candidateId));
    const pos = (n: string) => ranked.indexOf(n);
    expect(pos("Maya Chen")).toBe(0);
    for (const relevant of ["Maya Chen", "Jordan Alvarez"]) {
      for (const unrelated of [
        "Sam Okafor",
        "Lena Fischer",
        "Diego Santos",
        "Aisha Rahman",
        "Chris Patel",
        "Tom Becker",
      ]) {
        if (pos(unrelated) === -1) continue; // filtered out entirely is fine too
        expect(pos(relevant), `${relevant} vs ${unrelated}`).toBeLessThan(pos(unrelated));
      }
    }
    const maya = res.matches[0];
    expect(maya.score).toBeGreaterThanOrEqual(70);
    expect(maya.explanation).toMatch(/Matched on: .*meta ads/);
  });

  it("applies hard filters: paused, not-open, unclaimed and under-experienced profiles are excluded", async () => {
    const r = await db.root(
      "select c.full_name from matches m join candidates c on c.id = m.candidate_id where m.job_id = $1",
      [IDS.jobSocial],
    );
    const names = r.rows.map((x) => x.full_name);
    expect(names).not.toContain("Noah Williams"); // visibility paused
    expect(names).not.toContain("Elena Rossi"); // not open to work
    expect(names).not.toContain("Imported Person"); // unclaimed
    expect(names).not.toContain("Grace Kim"); // 1 year < 3 required
  });

  it("respects the block list and location/work-mode compatibility", async () => {
    await db.root("update candidates set visibility_paused = false where user_id = $1", [IDS.noah]);
    const res = await matchJob(deps, IDS.jobAccountant); // Globex, onsite Frankfurt
    const names = res.matches.map((m) => name.get(m.candidateId));
    expect(names).not.toContain("Noah Williams"); // blocked Globex (and remote-only)
    expect(names).not.toContain("Maya Chen"); // London, remote/hybrid only
    expect(names[0]).toBe("Lena Fischer");
  });

  it("only stores matches at or above the threshold by default", async () => {
    const res = await matchJob({ ...deps, threshold: undefined }, IDS.jobBackend);
    expect(res.matches.every((m) => m.score >= 70)).toBe(true);
    const stored = await db.root("select score from matches where job_id = $1", [IDS.jobBackend]);
    expect(stored.rows.every((r) => Number(r.score) >= 70)).toBe(true);
    expect(stored.rows.length).toBeGreaterThan(0);
  });
});

describe("idempotency", () => {
  it("re-running creates no duplicates", async () => {
    await matchJob(deps, IDS.jobSocial); // settle state changed by earlier tests
    const before = (await db.root("select count(*)::int n from matches")).rows[0].n;
    await matchJob(deps, IDS.jobSocial);
    await matchJob(deps, IDS.jobSocial);
    const after = (await db.root("select count(*)::int n from matches")).rows[0].n;
    expect(after).toBe(before);
    const dupes = await db.root("select job_id, candidate_id, count(*) from matches group by 1, 2 having count(*) > 1");
    expect(dupes.rows).toHaveLength(0);
  });

  it("does not touch matches that were already sent or answered", async () => {
    const m = (
      await db.root("select id, score from matches where job_id = $1 order by score desc limit 1", [IDS.jobSocial])
    ).rows[0];
    await db.service("select mark_match_notified($1)", [m.id]);
    await db.root(
      "update candidates set summary = summary || ' Also loves spreadsheets.' where id = (select candidate_id from matches where id = $1)",
      [m.id],
    );
    await runPendingMatching(deps);
    await matchJob(deps, IDS.jobSocial);
    const row = (await db.root("select status, score from matches where id = $1", [m.id])).rows[0];
    expect(row.status).toBe("notified");
    expect(Number(row.score)).toBe(Number(m.score));
  });

  it("candidate-side matching finds the right jobs", async () => {
    const sam = await db.candidateId(IDS.sam);
    const res = await matchCandidate(deps, sam);
    const titles = await db.root(
      "select j.title from matches m join jobs j on j.id = m.job_id where m.candidate_id = $1 order by m.score desc",
      [sam],
    );
    expect(titles.rows[0].title).toMatch(/Backend/);
    expect(res.kept).toBeGreaterThan(0);
  });

  it("clears needs_matching flags after a run", async () => {
    await runPendingMatching(deps, 100);
    const r = await db.root("select count(*)::int n from jobs where needs_matching and status = 'published'");
    expect(r.rows[0].n).toBe(0);
  });
});
