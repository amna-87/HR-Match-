import { redirect } from "next/navigation";
import { getPool } from "@/lib/db";
import { verifyOptOut } from "@/lib/outreach/message";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stop recruiter messages", robots: { index: false } };

async function stop(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const hash = verifyOptOut(token);
  if (!hash) redirect(`/stop/${encodeURIComponent(token)}?invalid=1`);
  await getPool().query("select public.suppress_contact($1, 'opt_out')", [hash]);
  redirect(`/stop/${encodeURIComponent(token)}?done=1`);
}

/**
 * One-click opt-out from every recruiter message sent through Vouch (D-031).
 * A button (not the link itself) confirms, so mail scanners can't trigger it.
 */
export default async function StopPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const valid = !!verifyOptOut(token);
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>
          {sp.done ? "You won't hear from recruiters through Vouch again" : "Stop recruiter messages"}
        </CardTitle>
        <CardDescription>
          {sp.done
            ? "Your address is on our do-not-contact list. No recruiter on Vouch can send you a message through us."
            : valid
              ? "Recruiters on Vouch can send you job opportunities that match your resume. Stop all of these messages, from every recruiter, with one click."
              : "This link isn't valid. If you copied it from a message, check it's complete."}
        </CardDescription>
      </CardHeader>
      {!sp.done && valid && (
        <CardContent>
          <form action={stop}>
            <input type="hidden" name="token" value={token} />
            <Button>Stop all recruiter messages</Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
