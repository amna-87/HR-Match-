import { InfoPage } from "@/components/info-page";

export const metadata = {
  title: "About Vouch",
  description: "Vouch is a hiring workspace for recruiters and a consent-first job board for job seekers.",
};

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="About"
      title="Hiring that respects people on both sides"
      intro="Vouch is a workspace for recruiters and HR teams, and a free job board where anyone can find work that fits them. Nothing about a person is shared without their OK."
      cta={[
        { href: "/jobs", label: "Browse jobs" },
        { href: "/for-recruiters", label: "For recruiters" },
      ]}
      sections={[
        {
          heading: "For job seekers",
          body: (
            <p>
              Browse and search every job without an account. Create a free profile from your resume and we&apos;ll tell
              you when a job fits, with the reason. Employers see your profile only when you choose to apply or agree to
              an introduction. You can export or delete your data at any time.
            </p>
          ),
        },
        {
          heading: "For recruiters",
          body: (
            <p>
              Upload the resumes you already have into a private talent pool, bring in jobs from anywhere (paste, a
              spreadsheet or a company&apos;s careers feed), and see the best people for each job ranked with a clear
              reason. Reach out with built-in safeguards: opt-outs are honoured across all of Vouch.
            </p>
          ),
        },
        {
          heading: "What we never do",
          body: (
            <ul className="list-disc space-y-1 pl-5">
              <li>Apply for anyone, or show a profile to an employer, without that person&apos;s approval.</li>
              <li>Use age, gender, religion, ethnicity, nationality, marital status or photos in matching.</li>
              <li>Scrape job portals, or present a job from elsewhere as if the employer posted it with us.</li>
              <li>Publish resumes. A recruiter&apos;s talent pool is visible only to their own workspace.</li>
            </ul>
          ),
        },
      ]}
    />
  );
}
