export const dynamic = "force-dynamic";

export default function HealthPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Health</h1>
      <p>
        App is running. Machine-readable status:{" "}
        <a className="underline" href="/api/health">
          /api/health
        </a>
      </p>
    </div>
  );
}
