/**
 * LPA portal scraping tool. Delegates to the shared `scrapeLpaPortal` helper
 * which already handles Idox / Civica / Northgate detection, throttling, and
 * polite bot behaviour.
 */

import { tool } from "ai";
import { z } from "zod";
import { scrapeLpaPortal } from "@/lib/lpa-portal";

export const lpaPortalScrapeTool = tool({
  description:
    "Scrape the LPA's public planning portal for applicant, agent, case officer, and date fields. Use when PlanWire returned no applicant names. Requires the council website URL and application reference.",
  inputSchema: z.object({
    councilWebsite: z
      .string()
      .url()
      .describe("The council's planning portal URL (homepage acceptable)."),
    reference: z.string().min(1).describe("Council's planning application reference."),
  }),
  execute: async ({ councilWebsite, reference }) => {
    if (process.env.LPA_SCRAPE_DISABLED === "true") {
      return { found: false as const, disabled: true };
    }
    try {
      const res = await scrapeLpaPortal({ councilWebsite, reference });
      if (!res) return { found: false as const };
      return {
        found: true as const,
        applicantName: res.applicantName ?? null,
        applicantAddress: res.applicantAddress ?? null,
        agentName: res.agentName ?? null,
        agentAddress: res.agentAddress ?? null,
        agentPhone: res.agentPhone ?? null,
        agentEmail: res.agentEmail ?? null,
        caseOfficer: res.caseOfficer ?? null,
        ward: res.ward ?? null,
        receivedDate: res.receivedDate ?? null,
        validatedDate: res.validatedDate ?? null,
        targetDate: res.targetDate ?? null,
        sourceUrl: res.sourceUrl ?? null,
        portal: res.portal ?? null,
      };
    } catch (e) {
      return {
        found: false as const,
        error: e instanceof Error ? e.message : "Scrape failed",
      };
    }
  },
});
