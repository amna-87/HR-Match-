import { CheckCircle2 } from "lucide-react";
import { LogoMark } from "@/components/logo";

const points = [
  "Upload your resume once — we build your profile",
  "Get matched to jobs that fit your skills",
  "Nothing is sent to an employer without your approval",
];

/** Split layout for log in / sign up / password pages: brand panel + form. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-card grid overflow-hidden rounded-3xl border shadow-(--shadow-card) lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between gap-10 bg-gradient-to-br from-indigo-700 via-indigo-600 to-teal-600 p-10 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <LogoMark className="bg-white/15 bg-none shadow-none" />
          {process.env.APP_NAME ?? "Vouch"}
        </div>
        <div className="space-y-6">
          <p className="text-3xl leading-tight font-semibold tracking-tight text-balance">
            The job search where you stay in control.
          </p>
          <ul className="space-y-3 text-indigo-50">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-200" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-indigo-100">Free for job seekers. Always.</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-md [&>div]:border-0 [&>div]:shadow-none">{children}</div>
      </div>
    </div>
  );
}
