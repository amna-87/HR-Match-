import { verifyToken } from "@/lib/consent/tokens";
import { getPool } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function unsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const v = verifyToken(token, ["unsubscribe"]);
  if (!v.ok) redirect(`/unsubscribe/${encodeURIComponent(token)}?error=1`);
  await getPool().query("select public.unsubscribe_candidate($1)", [v.ok ? v.payload.c : null]);
  redirect(`/unsubscribe/${encodeURIComponent(token)}?done=1`);
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const token = decodeURIComponent((await params).token);
  const sp = await searchParams;
  const v = verifyToken(token, ["unsubscribe"]);
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Match emails</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!v.ok || sp.error ? (
          <p>This unsubscribe link is invalid or expired. You can turn emails off in your Preferences.</p>
        ) : sp.done ? (
          <p>
            You&apos;re unsubscribed. You&apos;ll still see new matches in your dashboard. You can turn emails back on
            in Preferences.
          </p>
        ) : (
          <form action={unsubscribe} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <p>Stop receiving match emails?</p>
            <SubmitButton>Unsubscribe</SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
