"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="border-border bg-card mx-auto my-6 max-w-xl space-y-3 rounded-3xl border px-6 py-14 text-center shadow-(--shadow-card) sm:my-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Something went wrong</h1>
      <p className="text-muted-foreground">Nothing was sent on your behalf. Please try again.</p>
      {error.digest && <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
