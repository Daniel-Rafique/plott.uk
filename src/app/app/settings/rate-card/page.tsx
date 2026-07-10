import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { RateCardSettings } from "./rate-card-settings";

export const dynamic = "force-dynamic";

export default async function RateCardPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/auth/sign-in");

  const row = await prisma.companyRateCard.findUnique({
    where: { companyId: ctx.company.id },
  });

  return (
    <RateCardSettings
      initial={
        row
          ? {
              dayRateGbp: row.dayRateGbp,
              crewSizeDefault: row.crewSizeDefault,
              unitRates: (row.unitRatesJson as Record<string, number>) ?? {},
              typicalWeeks:
                (row.typicalWeeksJson as Record<string, number>) ?? {},
              contingencyPercent: row.contingencyPercent,
              vatInclusive: row.vatInclusive,
            }
          : null
      }
    />
  );
}
