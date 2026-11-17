export const metadata = { title: "Terms of Service" };

const appName = process.env.APP_NAME ?? "Vouch";

export default function TermsPage() {
  return (
    <article className="prose max-w-3xl space-y-4">
      <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
        DRAFT — not yet reviewed by a qualified legal professional. Must be reviewed before launch.
      </p>
      <h1 className="text-3xl font-semibold">Terms of Service</h1>
      <h2 className="text-xl font-semibold tracking-tight">1. What {appName} does</h2>
      <p>
        {appName} matches candidate profiles to job openings. We never submit an application, or show your profile to an
        employer, without your explicit approval.
      </p>
      <h2 className="text-xl font-semibold tracking-tight">2. Accounts</h2>
      <p>
        You must provide accurate information and keep your password secure. Recruiters may only post jobs for companies
        they represent.
      </p>
      <h2 className="text-xl font-semibold tracking-tight">3. Sourced listings</h2>
      <p>
        Some listings are sourced from external sites and are clearly labeled. For those, you apply via the original
        listing; the employer has not necessarily joined {appName}. Owners can request removal at /takedown.
      </p>
      <h2 className="text-xl font-semibold tracking-tight">4. Acceptable use</h2>
      <p>
        No scraping, spam, discriminatory job requirements, or misuse of candidate data. We may suspend accounts that
        break these rules.
      </p>
      <h2 className="text-xl font-semibold tracking-tight">5. Recruiter workspaces</h2>
      <p>
        Recruiters may upload only resumes they are allowed to use for recruiting (for example, received from the person
        for job opportunities) and must confirm this on every upload. Recruiters may contact people only when they have
        a lawful basis, must honour opt-outs and must not use contact details shown after an introduction for any other
        purpose. Laws on contacting people from collected resumes differ by country; recruiters are responsible for
        following the law where they and the people they contact are. We may pause outreach or suspend workspaces that
        receive complaints or break these rules. Jobs added from other sources must be shared with you or published for
        reuse; no scraping.
      </p>
      <h2 className="text-xl font-semibold tracking-tight">6. Fees and plans</h2>
      <p>
        {appName} is currently free, with usage limits on the free plan (talent pool size, messages per day, connected
        job sources). We will give notice before introducing any recruiter fees. Candidates will never pay.
      </p>
      <h2 className="text-xl font-semibold tracking-tight">7. Liability</h2>
      <p>We provide the service as-is and do not guarantee employment outcomes. [To be completed with legal review.]</p>
    </article>
  );
}
