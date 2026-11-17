import { InfoPage } from "@/components/info-page";

export const metadata = {
  title: "For recruiters",
  description:
    "Upload resumes in bulk, bring in jobs from anywhere and find the best people for each role, with safeguards built in.",
};

export default function ForRecruiters() {
  return (
    <InfoPage
      eyebrow="For recruiters and HR teams"
      title="Your resumes, your jobs, the best matches, in one place"
      intro="Vouch is a workspace for recruiters. Free to start: a talent pool of 500 profiles, 50 messages a day and 3 connected job sources."
      cta={[
        { href: "/signup?role=recruiter", label: "Start free" },
        { href: "/how-matching-works", label: "How matching works" },
      ]}
      sections={[
        {
          heading: "Bulk upload resumes",
          body: (
            <p>
              Drag in up to 200 PDF or Word resumes at a time, or a ZIP. Vouch reads them in the background, removes
              duplicates and lets you tag, note and search your pool, including &ldquo;describe who you need&rdquo;
              search. Your pool is private to your workspace.
            </p>
          ),
        },
        {
          heading: "Bring in jobs from anywhere",
          body: (
            <p>
              Paste a post from WhatsApp or email, import a spreadsheet, or connect a company&apos;s official careers
              feed (Greenhouse, Lever). Only a title and one way to apply are needed.
            </p>
          ),
        },
        {
          heading: "See the best people for every job",
          body: (
            <p>
              Each job shows the top matches from your pool with a one-line reason, and each person shows the best jobs
              for them. Want more? Ask for an introduction to people other recruiters chose to share anonymously: they
              decide whether to meet you.
            </p>
          ),
        },
        {
          heading: "Reach out, safely",
          body: (
            <p>
              Send an opportunity to the people you pick: copy a ready message or export contacts with the job. Every
              message says who sent it and why and has a one-click opt-out that applies across all of Vouch. People
              marked do-not-contact are always left out.
            </p>
          ),
        },
        {
          id: "feeds",
          heading: "About our job-feed bot (VouchJobsBot)",
          body: (
            <p>
              When a recruiter connects a company&apos;s careers feed, VouchJobsBot reads that company&apos;s public job
              board API (Greenhouse or Lever) about once a day. It never scrapes job portals and never applies for
              anyone. Jobs link back to the company&apos;s own apply page. Companies can ask for removal at /takedown.
            </p>
          ),
        },
      ]}
    />
  );
}
