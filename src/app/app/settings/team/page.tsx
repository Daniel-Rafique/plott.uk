import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getSeatUsage } from "@/lib/seats";
import { TeamSettings } from "./team-settings";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const [memberships, invites, seatUsage] = await Promise.all([
    prisma.membership.findMany({
      where: { companyId: ctx.company.id },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({
      where: { companyId: ctx.company.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    getSeatUsage(ctx.company.id),
  ]);

  return (
    <TeamSettings
      currentUserId={ctx.user.id}
      currentRole={ctx.membership.role}
      members={memberships.map((m) => ({
        id: m.id,
        role: m.role,
        userId: m.user.id,
        email: m.user.email,
        name: m.user.name,
      }))}
      invites={invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt.toISOString(),
      }))}
      seatUsage={{
        current: seatUsage.total,
        limit: seatUsage.limit,
        overage: seatUsage.overage,
        overageAllowed: seatUsage.overageAllowed,
        overagePriceLabel: seatUsage.overagePriceLabel,
        planName: seatUsage.plan.name,
      }}
    />
  );
}
