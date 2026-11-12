export const metadata = { title: "Privacy Policy" };

const appName = process.env.APP_NAME ?? "HireLoop";

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl space-y-4">
      <p className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
        DRAFT — not yet reviewed by a qualified legal professional. Must be reviewed before launch.
      </p>
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p>We apply a GDPR-style baseline to everyone, wherever you live.</p>
      <h2 className="text-xl font-semibold">What we collect</h2>
      <ul className="list-disc pl-6">
        <li>Account details (email, name) and the resume you upload (stored privately; never public).</li>
        <li>Your structured profile: skills, experience, education, certifications, preferences.</li>
        <li>Consent records: when you approve or decline a match (with hashed, not raw, IP and browser details).</li>
      </ul>
      <h2 className="text-xl font-semibold">What we never do</h2>
      <ul className="list-disc pl-6">
        <li>Share your profile with an employer before you approve.</li>
        <li>Use age, gender, religion, ethnicity, marital status, nationality or photos for matching.</li>
        <li>Send marketing email to addresses found in resumes.</li>
        <li>Show recruiters&apos; private interview notes to anyone outside their company.</li>
      </ul>
      <h2 className="text-xl font-semibold">Processors</h2>
      <p>
        Hosting (Vercel, Supabase), email delivery (Resend) and AI processing for resume parsing and matching explanations (Anthropic; an
        embeddings provider). [List to be finalised with legal review.]
      </p>
      <h2 className="text-xl font-semibold">Your rights</h2>
      <p>
        From your Privacy page you can download all your data as JSON, delete your account (this removes your profile, resume files,
        embeddings and consents), and unsubscribe from emails at any time. Contact: {process.env.SUPPORT_EMAIL ?? "support@example.com"}.
      </p>
      <p className="text-sm text-muted-foreground">{appName} · Draft version 0.1</p>
    </article>
  );
}
