import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { AccountSecuritySettings } from "./account-security-settings";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const ctx = await getTenantContext({ requireVerified: true });
  if (!ctx) redirect("/auth/sign-in");

  const [user, accountsResult] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: {
        email: true,
        name: true,
        twoFactorEmailEnabled: true,
      },
    }),
    auth.listAccounts().catch(() => ({ data: null })),
  ]);

  const accounts = Array.isArray(accountsResult.data)
    ? accountsResult.data.map((account) => ({
        providerId:
          typeof account.providerId === "string" ? account.providerId : "unknown",
      }))
    : [];
  const hasCredentialAccount =
    !Array.isArray(accountsResult.data) ||
    accounts.some((account) => account.providerId === "credential");

  return (
    <AccountSecuritySettings
      user={{
        email: user?.email ?? ctx.user.email,
        name: user?.name ?? ctx.user.name,
        twoFactorEmailEnabled: Boolean(user?.twoFactorEmailEnabled),
      }}
      accounts={{
        hasCredentialAccount,
        providers: accounts.map((account) => account.providerId),
      }}
    />
  );
}
