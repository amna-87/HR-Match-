import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-4 py-8">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Your resume gets matched to jobs automatically.</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          And nothing happens without your permission. We only send your profile to an employer after you click approve.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/signup?role=candidate" className={buttonClasses("default", "lg")}>
            I&apos;m looking for work
          </Link>
          <Link href="/signup?role=recruiter" className={buttonClasses("outline", "lg")}>
            I&apos;m hiring
          </Link>
        </div>
      </section>
      <section className="grid gap-6 sm:grid-cols-3">
        {[
          ["1. Upload your resume", "We turn it into a structured profile you can edit. Your file stays private."],
          ["2. Get matched", "When a job fits your skills and experience, we email you with a short explanation."],
          ["3. You decide", "Approve to apply, or decline. Recruiters only see candidates who said yes."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-lg border border-border bg-card p-5">
            <h2 className="font-semibold">{t}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>
      <p className="text-sm text-muted-foreground">
        Matching uses skills and experience only — never age, gender, religion, ethnicity, marital status, nationality or photos.
      </p>
    </div>
  );
}
