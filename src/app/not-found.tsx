import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-3 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Not found</h1>
      <p className="text-muted-foreground">This page doesn&apos;t exist or is no longer available.</p>
      <Link href="/" className="underline">
        Go home
      </Link>
    </div>
  );
}
