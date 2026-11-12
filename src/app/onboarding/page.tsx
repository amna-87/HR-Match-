import Link from "next/link";
import { chooseRole } from "@/app/(auth)/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>One more step</CardTitle>
        <CardDescription>Tell us how you&apos;ll use the platform. This can&apos;t be changed later.</CardDescription>
      </CardHeader>
      <CardContent>
        <Flash searchParams={await searchParams} />
        <form action={chooseRole} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">I am…</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="candidate" defaultChecked /> Looking for work
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="recruiter" /> Hiring for a company
            </label>
          </fieldset>
          <Field label="Full name" htmlFor="full_name">
            <Input id="full_name" name="full_name" maxLength={200} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="terms" required className="mt-1" />
            <span>
              I agree to the <Link href="/terms" className="underline">Terms</Link> and{" "}
              <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </span>
          </label>
          <SubmitButton className="w-full">Continue</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
