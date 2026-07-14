import { NextResponse } from "next/server";
import {
  redirectForStage,
  resolveStage,
} from "@/lib/auth/onboarding-gate";
import { StaleAuthUserError } from "@/lib/tenant";

export const runtime = "nodejs";

/**
 * Client seed for the in-modal onboarding wizard after verify/sign-in.
 * Returns stage + company fields without requiring a full page load.
 */
export async function GET() {
  try {
    const resolved = await resolveStage();

    if (resolved.stage === "unauthenticated") {
      return NextResponse.json({ stage: "unauthenticated" }, { status: 401 });
    }
    if (resolved.stage === "unverified") {
      return NextResponse.json({
        stage: "unverified",
        email: resolved.user.email ?? null,
      });
    }
    if (resolved.stage === "pending_invite") {
      return NextResponse.json({
        stage: "pending_invite",
        redirect: redirectForStage(resolved),
      });
    }
    if (resolved.stage === "needs_plan" || resolved.stage === "ready") {
      return NextResponse.json({
        stage: resolved.stage,
        redirect: redirectForStage(resolved),
      });
    }

    // needs_company
    const name = resolved.company.name.endsWith("'s Workspace")
      ? ""
      : resolved.company.name;

    return NextResponse.json({
      stage: "needs_company",
      initial: {
        name,
        websiteUrl: resolved.company.websiteUrl ?? "",
        addressLines: resolved.company.addressLines ?? "",
        phone: resolved.company.phone ?? "",
        logoBlobUrl: resolved.company.logoBlobUrl ?? null,
      },
    });
  } catch (err) {
    if (err instanceof StaleAuthUserError) {
      return NextResponse.json(
        { stage: "stale", error: err.message },
        { status: 400 },
      );
    }
    throw err;
  }
}
