import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRecruiter } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Introduced profile" };

type Exp = { title?: string; company?: string; start_date?: string; end_date?: string; is_current?: boolean };

export default async function IntroducedProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireRecruiter();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase.rpc("introduced_profile", { p_id: id });
  const p = (data as Record<string, unknown>[] | null)?.[0] as
    | {
        full_name: string | null;
        headline: string | null;
        summary: string | null;
        location: string | null;
        contact_email: string | null;
        contact_phone: string | null;
        experience_years: number;
        skills: string[];
        experiences: Exp[];
        has_resume: boolean;
        job_title: string;
      }
    | undefined;
  if (!p) notFound();
  return (
    <div className="space-y-6">
      <Link href="/recruiter/introductions" className="text-sm underline">
        ← Introductions
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{p.full_name || "Unnamed profile"}</CardTitle>
          <CardDescription>
            Agreed to be introduced for <strong>{p.job_title}</strong>. Use these details only for this opportunity.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{[p.headline, p.location, `${Number(p.experience_years) || 0} yrs`].filter(Boolean).join(" · ")}</p>
          <p className="font-medium">{[p.contact_email, p.contact_phone].filter(Boolean).join(" · ")}</p>
          {p.summary && <p className="text-muted-foreground whitespace-pre-line">{p.summary}</p>}
          <p>{p.skills.join(", ")}</p>
          {p.experiences.length > 0 && (
            <ul className="list-disc space-y-1 pl-5">
              {p.experiences.map((e, i) => (
                <li key={i}>
                  {e.title}
                  {e.company ? ` at ${e.company}` : ""}
                  {e.start_date
                    ? ` (${e.start_date.slice(0, 4)}–${e.is_current ? "now" : (e.end_date ?? "").slice(0, 4)})`
                    : ""}
                </li>
              ))}
            </ul>
          )}
          {p.has_resume && (
            <a href={`/api/recruiter/intro-resume/${id}`} className={buttonClasses("outline", "sm")}>
              Download resume
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
