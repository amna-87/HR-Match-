export const metadata = { title: "Privacy Policy" };

const appName = process.env.APP_NAME ?? "Vouch";

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl space-y-4">
      <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
        DRAFT — not yet reviewed by a qualified legal professional. Must be reviewed before launch.
      </p>
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p>We apply a GDPR-style baseline to everyone, wherever you live.</p>
      <h2 className="text-xl font-semibold tracking-tight">What we collect</h2>
      <ul className="list-disc pl-6">
        <li>Account details (email, name) and the resume you upload (stored privately; never public).</li>
        <li>Your structured profile: skills, experience, education, certifications, preferences.</li>
        <li>Consent records: when you approve or decline a match (with hashed, not raw, IP and browser details).</li>
        <li>Jobs you save and introduction requests you answer.</li>
      </ul>
      <h2 className="text-xl font-semibold tracking-tight">Resumes uploaded by recruiters</h2>
      <p>
        A recruiter may add resumes they received (for example, people who applied to them) to their private talent pool
        on {appName}, after confirming they may do so. A pool is visible only to that recruiter&apos;s workspace. A
        workspace may choose to let other recruiters see an <strong>anonymous card</strong> (headline, location, years
        of experience, skills), never your name, contact details or resume file. Another recruiter can only see your
        details if you agree to an introduction: in your dashboard if you are on {appName}, or by telling the recruiter
        who holds your resume.
      </p>
      <p>
        If you sign up with the same email address, your dashboard shows which recruiter holds your resume. You can add
        it to your own profile or delete it from their pool. Deleting your account deletes these profiles too. You can
        also ask us to remove one at {process.env.SUPPORT_EMAIL ?? "support@example.com"}.
      </p>
      <h2 className="text-xl font-semibold tracking-tight">Messages from recruiters</h2>
      <p>
        A recruiter who holds your resume may send you a job opportunity through {appName}. Every such message says who
        sent it and why and has a one-click link to stop all recruiter messages through {appName}. When you use it, we
        keep only a one-way fingerprint (hash) of your email or phone number so that no recruiter can contact you
        through us again. {appName} itself never sends you marketing because a recruiter uploaded your resume.
      </p>
      <h2 className="text-xl font-semibold tracking-tight">Job listings</h2>
      <p>
        Jobs can come from employers on {appName}, from recruiters, from spreadsheets or from companies&apos; official
        job-board feeds. Jobs from elsewhere are labeled with their source. Phone and WhatsApp numbers and personal
        email addresses published as a job&apos;s apply contact are hidden from anonymous visitors and shown only to
        signed-in users or after a quick human check. Anyone can ask us to remove a listing at /takedown.
      </p>
      <h2 className="text-xl font-semibold tracking-tight">What we never do</h2>
      <ul className="list-disc pl-6">
        <li>Share your profile with an employer before you approve.</li>
        <li>Use age, gender, religion, ethnicity, marital status, nationality or photos for matching.</li>
        <li>Send marketing email to addresses found in resumes.</li>
        <li>Show recruiters&apos; private interview notes to anyone outside their company.</li>
      </ul>
      <h2 className="text-xl font-semibold tracking-tight">Processors</h2>
      <p>
        Hosting (Vercel, Supabase), email delivery (Resend) and AI processing for resume parsing and matching
        explanations (Anthropic; an embeddings provider). [List to be finalised with legal review.]
      </p>
      <h2 className="text-xl font-semibold tracking-tight">Your rights</h2>
      <p>
        From your Privacy page you can download all your data as JSON, delete your account (this removes your profile,
        resume files, embeddings and consents), and unsubscribe from emails at any time. Contact:{" "}
        {process.env.SUPPORT_EMAIL ?? "support@example.com"}.
      </p>
      <p className="text-muted-foreground text-sm">{appName} · Draft version 0.2</p>
    </article>
  );
}
