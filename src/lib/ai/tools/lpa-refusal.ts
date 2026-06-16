/**
 * LPA refusal-notice scraping tool. Pulls the decision, decision date, and
 * refusal reasons from a council portal so the appeal-viability classifier
 * can reason about whether an appeal is warranted.
 *
 * Currently only Idox Public Access is supported — Civica and Northgate
 * return `{ found: false }` and the caller should fall back to web search.
 */

import { tool } from "ai";
import { z } from "zod";
import { scrapeLpaRefusalNotice } from "@/lib/lpa-portal";

export const lpaRefusalNoticeScrapeTool = tool({
  description:
    "Scrape the LPA's public planning portal for the decision notice on a refused application — decision text, decision date, and the numbered reasons for refusal. Use this as the first step when evaluating whether a refusal warrants an appeal.",
  inputSchema: z.object({
    councilWebsite: z
      .string()
      .url()
      .describe("The council's planning portal URL (homepage acceptable)."),
    reference: z
      .string()
      .min(1)
      .describe("Council's planning application reference."),
  }),
  execute: async ({ councilWebsite, reference }) => {
    if (process.env.LPA_SCRAPE_DISABLED === "true") {
      return { found: false as const, disabled: true };
    }
    try {
      const res = await scrapeLpaRefusalNotice({ councilWebsite, reference });
      if (!res) return { found: false as const };
      return {
        found: true as const,
        decision: res.decision ?? null,
        decisionDate: res.decisionDate ?? null,
        decisionReasons: res.decisionReasons ?? null,
        decisionSummary: res.decisionSummary ?? null,
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
