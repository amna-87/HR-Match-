import { submitTakedown } from "./actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export const metadata = { title: "Request removal" };

export default async function TakedownPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Request removal of a listing</CardTitle>
        <CardDescription>
          If a sourced job listing on this site belongs to you and you&apos;d like it removed or corrected, tell us here. We review requests
          promptly and log every removal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Flash searchParams={sp} />
        <form action={submitTakedown} className="space-y-4">
          <input type="hidden" name="job_id" value={sp.job ?? ""} />
          <div className="hidden" aria-hidden="true">
            <label>
              Website <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <Field label="Listing URL or title" htmlFor="reference" hint={sp.job ? "We've attached the listing you came from." : undefined}>
            <Input id="reference" name="reference" maxLength={500} />
          </Field>
          <Field label="Your contact (email or phone)" htmlFor="contact">
            <Input id="contact" name="contact" required maxLength={320} />
          </Field>
          <Field label="Reason" htmlFor="reason">
            <Textarea id="reason" name="reason" required maxLength={5000} />
          </Field>
          <SubmitButton>Send request</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
