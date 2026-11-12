import { requestPasswordReset } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Flash } from "@/components/flash";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
      </CardHeader>
      <CardContent>
        <Flash searchParams={await searchParams} />
        <form action={requestPasswordReset} className="space-y-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" required />
          </Field>
          <SubmitButton className="w-full">Send reset link</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
