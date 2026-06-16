import type { Company, Membership, User } from "@prisma/client";
import { hasSubscriptionAccess } from "@/lib/subscription-entitlement";

export type MembershipWithCompany = Membership & { company: Company };

export function choosePreferredMembership(
  user: Pick<User, "activeCompanyId">,
  memberships: MembershipWithCompany[],
): MembershipWithCompany | null {
  const activeMembership = memberships.find(
    (membership) => membership.companyId === user.activeCompanyId,
  );
  if (activeMembership) return activeMembership;

  const subscribedMembership = memberships.find((membership) =>
    hasSubscriptionAccess(membership.company),
  );
  if (subscribedMembership) return subscribedMembership;

  return (
    memberships[0] ?? null
  );
}
