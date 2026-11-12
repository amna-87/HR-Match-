import Link from "next/link";
import { signUp, logInWithGoogle } from "../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Flash } from "@/components/flash";

export const metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const role = sp.role === "recruiter" ? "recruiter" : "candidate";
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>Free for everyone during our early access.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Flash searchParams={sp} />
        <form action={signUp} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">I am…</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="candidate" defaultChecked={role === "candidate"} /> Looking for work
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="role" value="recruiter" defaultChecked={role === "recruiter"} /> Hiring for a company
            </label>
          </fieldset>
          <Field label="Full name" htmlFor="full_name">
            <Input id="full_name" name="full_name" autoComplete="name" required maxLength={200} />
          </Field>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 10 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="password-hint" />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="terms" required className="mt-1" />
            <span>
              I agree to the <Link href="/terms" className="underline">Terms</Link> and{" "}
              <Link href="/privacy" className="underline">Privacy Policy</Link>.
            </span>
          </label>
          <SubmitButton className="w-full">Create account</SubmitButton>
        </form>
        <form action={logInWithGoogle}>
          <Button variant="outline" className="w-full" type="submit">
            Sign up with Google
          </Button>
        </form>
        <p className="text-sm">
          Already have an account? <Link href="/login" className="underline">Log in</Link>
        </p>
      </CardContent>
    </Card>
  );
}
