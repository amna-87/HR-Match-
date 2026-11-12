import Link from "next/link";
import { logIn, logInWithGoogle } from "../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Flash } from "@/components/flash";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Flash searchParams={sp} />
        <form action={logIn} className="space-y-4">
          <input type="hidden" name="next" value={sp.next ?? ""} />
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton className="w-full">Log in</SubmitButton>
        </form>
        <form action={logInWithGoogle}>
          <Button variant="outline" className="w-full" type="submit">
            Continue with Google
          </Button>
        </form>
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="underline">
            Forgot password?
          </Link>
          <Link href="/signup" className="underline">
            Create an account
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
