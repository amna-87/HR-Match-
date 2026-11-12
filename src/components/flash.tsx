import { Alert } from "@/components/ui/alert";

/** Renders ?ok= / ?error= messages set by server-action redirects. */
export function Flash({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const ok = typeof searchParams.ok === "string" ? searchParams.ok : null;
  const error = typeof searchParams.error === "string" ? searchParams.error : null;
  if (!ok && !error) return null;
  return (
    <Alert tone={error ? "error" : "success"} className="mb-4">
      {error ?? ok}
    </Alert>
  );
}
