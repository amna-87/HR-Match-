import { updatePassword } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
      </CardHeader>
      <CardContent>
        <Flash searchParams={await searchParams} />
        <form action={updatePassword} className="space-y-4">
          <Field label="New password" htmlFor="password" hint="At least 10 characters.">
            <Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" />
          </Field>
          <SubmitButton className="w-full">Update password</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
