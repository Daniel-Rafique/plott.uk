/**
 * Admin gating. There is no dedicated admin role on User; instead, we compare
 * the signed-in user's email against the `ADMIN_EMAILS` env var (comma- or
 * space-separated). This keeps admin surface area tiny and makes it obvious
 * who has access.
 */

import { getSessionUser } from "@/lib/auth/session";

function normalise(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(/[\s,]+/)
      .map((e) => normalise(e))
      .filter(Boolean),
  );
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = await getSessionUser();
  if (!user?.email) return false;
  const set = adminEmails();
  if (set.size === 0) return false;
  return set.has(normalise(user.email));
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const set = adminEmails();
  return set.size > 0 && set.has(normalise(email));
}
