export const metadata = { title: "Terms of Service" };

const appName = process.env.APP_NAME ?? "HireLoop";

export default function TermsPage() {
  return (
    <article className="prose max-w-3xl space-y-4">
      <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
        DRAFT — not yet reviewed by a qualified legal professional. Must be reviewed before launch.
      </p>
      <h1 className="text-3xl font-semibold">Terms of Service</h1>
      <h2 className="text-xl font-semibold">1. What {appName} does</h2>
      <p>
        {appName} matches candidate profiles to job openings. We never submit an application, or show your profile to an
        employer, without your explicit approval.
      </p>
      <h2 className="text-xl font-semibold">2. Accounts</h2>
      <p>
        You must provide accurate information and keep your password secure. Recruiters may only post jobs for companies
        they represent.
      </p>
      <h2 className="text-xl font-semibold">3. Sourced listings</h2>
      <p>
        Some listings are sourced from external sites and are clearly labeled. For those, you apply via the original
        listing; the employer has not necessarily joined {appName}. Owners can request removal at /takedown.
      </p>
      <h2 className="text-xl font-semibold">4. Acceptable use</h2>
      <p>
        No scraping, spam, discriminatory job requirements, or misuse of candidate data. We may suspend accounts that
        break these rules.
      </p>
      <h2 className="text-xl font-semibold">5. Fees</h2>
      <p>
        {appName} is currently free. We will give notice before introducing any recruiter fees. Candidates will never
        pay.
      </p>
      <h2 className="text-xl font-semibold">6. Liability</h2>
      <p>We provide the service as-is and do not guarantee employment outcomes. [To be completed with legal review.]</p>
    </article>
  );
}
