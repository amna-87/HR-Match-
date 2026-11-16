// Which environment is this? local | staging | production.
// Vercel sets VERCEL_ENV=preview for preview deployments; APP_ENV overrides it.
export type AppEnv = "local" | "staging" | "production";

export function appEnv(): AppEnv {
  const explicit = process.env.APP_ENV;
  if (explicit === "local" || explicit === "staging" || explicit === "production") return explicit;
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "staging";
  return process.env.NODE_ENV === "production" ? "production" : "local";
}
