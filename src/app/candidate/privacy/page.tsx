import { requireCandidate } from "@/lib/auth/session";
import { deleteAccount } from "../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { buttonClasses } from "@/components/ui/button";
import { Flash } from "@/components/flash";

export const metadata = { title: "Privacy" };

export default async function PrivacyToolsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await requireCandidate();
  return (
    <div className="space-y-6">
      <Flash searchParams={await searchParams} />
      <Card>
        <CardHeader>
          <CardTitle>Download your data</CardTitle>
          <CardDescription>Everything we hold about you — profile, resumes metadata, matches, applications and consent history — as JSON.</CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/api/candidate/export" className={buttonClasses("outline")}>Download my data (JSON)</a>
        </CardContent>
      </Card>
      <Card className="border-red-300">
        <CardHeader>
          <CardTitle>Delete my account</CardTitle>
          <CardDescription>
            Permanently removes your profile, resume files, embeddings, matches, applications and consent records. We keep only minimal,
            anonymized audit entries. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={deleteAccount} className="flex flex-wrap items-end gap-3">
            <Field label='Type "DELETE" to confirm' htmlFor="confirm">
              <Input id="confirm" name="confirm" required autoComplete="off" />
            </Field>
            <SubmitButton variant="destructive" pendingText="Deleting…">Delete my account</SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
