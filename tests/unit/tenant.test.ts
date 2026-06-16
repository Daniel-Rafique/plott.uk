import { describe, expect, it } from "vitest";
import { choosePreferredMembership } from "@/lib/tenant-selection";

type MembershipInput = Parameters<typeof choosePreferredMembership>[1][number];

function membership(
  companyId: string,
  subscriptionStatus = "none",
  subscriptionCurrentPeriodEnd: Date | null = null,
): MembershipInput {
  return {
    id: `membership-${companyId}`,
    userId: "user-1",
    companyId,
    role: "member",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    company: { id: companyId, subscriptionStatus, subscriptionCurrentPeriodEnd },
  } as MembershipInput;
}

describe("tenant membership selection", () => {
  it("prefers the active company over the oldest membership", () => {
    const personal = membership("personal-company");
    const invitedTeam = membership("invited-team");

    expect(
      choosePreferredMembership(
        { activeCompanyId: "invited-team" },
        [personal, invitedTeam],
      )?.companyId,
    ).toBe("invited-team");
  });

  it("falls back to the first membership when activeCompanyId is stale", () => {
    const personal = membership("personal-company");

    expect(
      choosePreferredMembership(
        { activeCompanyId: "deleted-company" },
        [personal],
      )?.companyId,
    ).toBe("personal-company");
  });

  it("prefers a subscribed team when no active company is set", () => {
    const personal = membership("personal-company");
    const invitedTeam = membership("invited-team", "trialing");

    expect(
      choosePreferredMembership(
        { activeCompanyId: null },
        [personal, invitedTeam],
      )?.companyId,
    ).toBe("invited-team");
  });

  it("prefers a canceled team while access remains available", () => {
    const personal = membership("personal-company");
    const invitedTeam = membership(
      "invited-team",
      "canceled",
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );

    expect(
      choosePreferredMembership(
        { activeCompanyId: null },
        [personal, invitedTeam],
      )?.companyId,
    ).toBe("invited-team");
  });
});
