import Link from "next/link";
import { LogoMark } from "@/components/logo";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="hero-glow border-border bg-card mx-auto my-6 flex max-w-xl flex-col items-center gap-4 rounded-3xl border px-6 py-14 text-center shadow-(--shadow-card) sm:my-12">
      <LogoMark className="h-14 w-14" />
      <p className="text-primary text-sm font-semibold">Error 404</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground max-w-sm">
        It may have moved, or the job may have closed. Try browsing the open roles instead.
      </p>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Link href="/jobs" className={buttonClasses()}>
          Browse jobs
        </Link>
        <Link href="/" className={buttonClasses("outline")}>
          Go home
        </Link>
      </div>
    </div>
  );
}
