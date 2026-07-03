/** Shared Sentry init options for Plott (server, edge, browser). */
export function sentryEnvironment(): string {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
}
