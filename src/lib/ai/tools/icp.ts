/**
 * ICP tool. Exposes the tenant's ICP profile to classifier agents so they
 * can reason about fit without the caller having to prompt it in.
 */

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export function makeIcpTool(companyId: string) {
  return tool({
    description:
      "Get the workspace's Ideal Customer Profile: description, preferred keywords, statuses, and exclusions. Use this to score applications for outreach fit.",
    inputSchema: z.object({}),
    execute: async () => {
      const p = await prisma.icpProfile.findUnique({
        where: { companyId },
      });
      if (!p) return { configured: false as const };
      return {
        configured: true as const,
        description: p.description,
        keywords: p.keywords,
        preferredStatuses: p.preferredStatuses,
        excludedKeywords: p.excludedKeywords,
        minProjectValueGbp: p.minProjectValueGbp,
      };
    },
  });
}
