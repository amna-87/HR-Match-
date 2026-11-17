import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

/** Simple, readable static page layout (About, How matching works, For recruiters). */
export function InfoPage({
  eyebrow,
  title,
  intro,
  sections,
  cta,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: { id?: string; heading: string; body: React.ReactNode }[];
  cta?: { href: string; label: string }[];
}) {
  return (
    <article className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-3">
        <p className="text-primary text-sm font-semibold">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
        <p className="text-muted-foreground text-lg">{intro}</p>
        {cta && (
          <div className="flex flex-wrap gap-2 pt-2">
            {cta.map((c, i) => (
              <Link key={c.href} href={c.href} className={buttonClasses(i === 0 ? "default" : "outline", "lg")}>
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </header>
      {sections.map((s) => (
        <section key={s.heading} id={s.id} className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight">{s.heading}</h2>
          <div className="text-muted-foreground space-y-3 leading-relaxed">{s.body}</div>
        </section>
      ))}
    </article>
  );
}
