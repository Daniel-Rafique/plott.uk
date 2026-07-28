import { sanitizeNext } from "@/lib/auth/sanitize-next";

const SETUP_REDIRECTS = {
  unauthenticated: "/auth/sign-in",
  unverified: "/auth/verify-email",
  needs_company: "/onboarding",
  needs_plan: "/subscribe",
} as const;

export type McpOAuthSetupStage =
  | { stage: "unauthenticated" }
  | { stage: "unverified" }
  | { stage: "pending_invite"; invitePath: string }
  | { stage: "needs_company" }
  | { stage: "needs_plan" }
  | { stage: "ready" };

/**
 * Where to send an MCP OAuth user who is not yet ready to approve consent.
 * Returns null when the consent UI may render.
 */
export function resolveMcpOAuthSetupPath(
  stage: McpOAuthSetupStage,
  returnPath: string,
): string | null {
  const next = sanitizeNext(returnPath);
  const encoded = next ? encodeURIComponent(next) : "";

  switch (stage.stage) {
    case "unauthenticated":
      return next
        ? `/auth/sign-in?next=${encoded}`
        : SETUP_REDIRECTS.unauthenticated;
    case "unverified":
      return next
        ? `/auth/verify-email?next=${encoded}`
        : SETUP_REDIRECTS.unverified;
    case "pending_invite":
      return stage.invitePath;
    case "needs_company":
      return next
        ? `/onboarding?next=${encoded}`
        : SETUP_REDIRECTS.needs_company;
    case "needs_plan":
      return next ? `/subscribe?next=${encoded}` : SETUP_REDIRECTS.needs_plan;
    case "ready":
      return null;
  }
}
