import { InfoPage } from "@/components/info-page";

export const metadata = {
  title: "How matching works",
  description: "How Vouch matches people and jobs: skills, experience and meaning, never protected characteristics.",
};

export default function HowMatchingWorks() {
  return (
    <InfoPage
      eyebrow="How it works"
      title="How Vouch matches people and jobs"
      intro="Every match comes with a plain reason, for example “Matched on Meta Ads, SEO; 5 years experience (3+ required)”. Here is what goes into it."
      cta={[{ href: "/signup?role=candidate", label: "Get matched" }]}
      sections={[
        {
          heading: "1. Hard requirements first",
          body: (
            <p>
              Jobs can require certain certifications or a minimum of experience. Profiles that clearly miss them are
              not suggested.
            </p>
          ),
        },
        {
          heading: "2. Meaning, not just keywords",
          body: (
            <p>
              We compare what a role is about with what a person has done, so “paid social” and “Meta Ads” can still
              match. This uses a text model on the job and profile text only.
            </p>
          ),
        },
        {
          heading: "3. Skills and experience",
          body: (
            <p>
              Required skills count most, nice-to-have skills a little, and years of experience are compared with the
              range the job asks for. Skills confirmed in a real interview (only when the person opted in) give a small
              boost.
            </p>
          ),
        },
        {
          heading: "4. What we never use",
          body: (
            <p>
              Age, gender, religion, ethnicity, nationality, marital status and photos are removed before anything is
              compared and are never part of a score.
            </p>
          ),
        },
        {
          heading: "5. You stay in control",
          body: (
            <p>
              A match is a suggestion. Job seekers decide whether to apply; recruiters see a person&apos;s details only
              after they apply or agree to an introduction. Recruiters&apos; own uploaded resumes stay in their private
              workspace.
            </p>
          ),
        },
      ]}
    />
  );
}
