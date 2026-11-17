// schema.org JobPosting for Google job search (7c). Never includes personal
// contact details; validThrough makes expired jobs drop out.
import { siteUrl, jobPath } from "@/lib/slug";

const EMPLOYMENT: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
  temporary: "TEMPORARY",
  freelance: "CONTRACTOR",
};

export function jobPostingJsonLd(j: {
  id: string;
  public_number: number;
  title: string;
  description_summary: string;
  published_at: string | null;
  expires_at: string | null;
  employment_type: string;
  work_mode: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  source_type: string;
  company: string | null;
  companyUrl?: string | null;
}) {
  const posted = j.published_at ?? new Date().toISOString();
  const valid = j.expires_at ?? new Date(new Date(posted).getTime() + 30 * 86400_000).toISOString();
  const [city, ...rest] = (j.location ?? "").split(",").map((s) => s.trim());
  const remote = j.work_mode === "remote";
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: j.title,
    description: `<p>${j.description_summary.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n+/g, "</p><p>")}</p>`,
    datePosted: posted,
    validThrough: valid,
    employmentType: EMPLOYMENT[j.employment_type] ?? "FULL_TIME",
    hiringOrganization: {
      "@type": "Organization",
      name: j.company ?? "Confidential employer",
      ...(j.companyUrl ? { sameAs: j.companyUrl } : {}),
    },
    identifier: { "@type": "PropertyValue", name: "Vouch", value: String(j.public_number) },
    url: `${siteUrl()}${jobPath(j)}`,
    directApply: j.source_type === "verified",
  };
  if (remote) {
    data.jobLocationType = "TELECOMMUTE";
    if (rest.length || city) data.applicantLocationRequirements = { "@type": "Country", name: rest.at(-1) || city };
  }
  if (city && !/remote/i.test(city))
    data.jobLocation = {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: city,
        ...(rest.length ? { addressCountry: rest.at(-1) } : {}),
      },
    };
  if (j.salary_min && j.salary_currency)
    data.baseSalary = {
      "@type": "MonetaryAmount",
      currency: j.salary_currency,
      value: {
        "@type": "QuantitativeValue",
        minValue: j.salary_min,
        maxValue: j.salary_max ?? j.salary_min,
        unitText: "MONTH",
      },
    };
  return data;
}

/** Safe to inline in a <script type="application/ld+json">. */
export function jsonLdString(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
