"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-3 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Something went wrong</h1>
      <p className="text-muted-foreground">Nothing was sent on your behalf. Please try again.</p>
      {error.digest && <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
