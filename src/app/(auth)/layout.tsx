import { CheckCircle2 } from "lucide-react";
import { LogoMark } from "@/components/logo";

const points = [
  "Job seekers: upload your resume once and get matched to jobs that fit",
  "Recruiters: post jobs, build a private talent pool and see the best fits",
  "Nothing is shared until the person says yes",
];

/** Split layout for log in / sign up / password pages: brand panel + form. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-card grid overflow-hidden rounded-3xl border shadow-(--shadow-card) lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between gap-10 bg-gradient-to-br from-violet-700 via-violet-700 to-fuchsia-700 p-10 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <LogoMark className="bg-white/15 bg-none shadow-none" />
          {process.env.APP_NAME ?? "Vouch"}
        </div>
        <div className="space-y-6">
          <p className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            Hiring and job search, with everyone in control.
          </p>
          <ul className="space-y-3 text-violet-50">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-200" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-violet-100">Free for job seekers. Always.</p>
        <LogoMark className="pointer-events-none absolute -right-16 -bottom-16 h-72 w-72 opacity-10" />
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-md space-y-2">
          <LogoMark className="mx-auto h-10 w-10 lg:hidden" />
          <div className="[&>div]:border-0 [&>div]:shadow-none">{children}</div>
        </div>
      </div>
    </div>
  );
}
