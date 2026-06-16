/**
 * Tenant-scoped branding tool. Returns the company letterhead fields so
 * drafting agents can personalise salutations and sign-offs.
 */

import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export function makeBrandingTool(companyId: string) {
  return tool({
    description:
      "Get the current workspace's branding: company name, sign-off contact, address, and website. Use to personalise outreach letters.",
    inputSchema: z.object({}),
    execute: async () => {
      const c = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          addressLines: true,
          phone: true,
          email: true,
          websiteUrl: true,
          letterFooter: true,
        },
      });
      if (!c) return { found: false as const };
      return {
        found: true as const,
        companyName: c.name,
        addressLines: c.addressLines,
        phone: c.phone,
        email: c.email,
        websiteUrl: c.websiteUrl,
        letterFooter: c.letterFooter,
      };
    },
  });
}
