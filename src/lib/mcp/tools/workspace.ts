import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpAuthContext } from "@/lib/mcp/auth-context";
import { requireScope } from "@/lib/mcp/auth-context";
import { idempotentTool, toolResult } from "@/lib/mcp/result";
import {
  fetchPipelinePage,
  parsePipelineSearchParams,
  upsertPipelineLead,
} from "@/lib/pipeline";
import { getCompanyPlan } from "@/lib/pricing";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import { isBodyOnlyHtml, renderLetterHtml } from "@/lib/letter-renderer";
import { sanitizeHtmlFragment } from "@/lib/sanitize-html";
import { checkRateLimit } from "@/lib/rate-limit";
import { TRADE_PLAYBOOKS } from "@/lib/trade-playbooks";

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

function requireFeature(value: boolean, message: string) {
  if (!value) throw new Error(message);
}

export function registerWorkspaceTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.registerTool(
    "get_workspace_sales_settings",
    {
      description: "Read the workspace ICP, rate card, and available trade playbooks.",
      annotations: { ...writeAnnotations, readOnlyHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:read"] }] },
    },
    async () => {
      requireScope(context, "workspace:read");
      const [icp, rateCard] = await Promise.all([
        prisma.icpProfile.findUnique({ where: { companyId: context.company.id } }),
        prisma.companyRateCard.findUnique({ where: { companyId: context.company.id } }),
      ]);
      return toolResult({
        icp,
        rateCard,
        playbooks: TRADE_PLAYBOOKS.map((playbook) => ({
          id: playbook.id,
          name: playbook.name,
          summary: playbook.summary,
          suggestedFilterKeywords: playbook.suggestedFilterKeywords,
        })),
      });
    },
  );

  server.registerTool(
    "save_dashboard_state",
    {
      description: "Persist map bounds and planning filters for the current user.",
      inputSchema: {
        bounds: z
          .object({
            west: z.number(),
            south: z.number(),
            east: z.number(),
            north: z.number(),
          })
          .nullable(),
        filters: z.record(z.unknown()),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: writeAnnotations,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:write"] }] },
    },
    async ({ idempotencyKey, ...state }) => {
      requireScope(context, "workspace:write");
      if (JSON.stringify(state).length > 500_000) throw new Error("Dashboard state is too large");
      const result = await idempotentTool(context, "save_dashboard_state", idempotencyKey, async () => {
        await prisma.user.update({
          where: { id: context.user.id },
          data: { dashboardState: state as Prisma.InputJsonObject },
        });
        return { ok: true };
      });
      return toolResult(result);
    },
  );

  server.registerTool(
    "list_pipeline_leads",
    {
      description: "List tenant-scoped pipeline leads with enrichment summaries.",
      inputSchema: {
        stage: z
          .enum(["all", "new", "contacted", "replied", "visit_booked", "quoted", "won", "lost"])
          .default("all"),
        assignee: z.string().default("all"),
        page: z.number().int().min(1).default(1),
        pageSize: z.enum(["25", "50", "100"]).default("25"),
      },
      annotations: { ...writeAnnotations, readOnlyHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["pipeline:read"] }] },
    },
    async (input) => {
      requireScope(context, "pipeline:read");
      const query = parsePipelineSearchParams(
        {
          stage: input.stage,
          assignee: input.assignee,
          page: String(input.page),
          pageSize: input.pageSize,
        },
        { companyId: context.company.id, currentUserId: context.user.id },
      );
      return toolResult(await fetchPipelinePage(query));
    },
  );

  server.registerTool(
    "upsert_pipeline_lead",
    {
      description: "Create a pipeline lead or advance an existing lead for a planning application.",
      inputSchema: {
        planningEntity: z.number().int(),
        applicationRef: z.string().max(160).optional(),
        siteAddress: z.string().max(500).optional(),
        description: z.string().max(3000).optional(),
        workLabel: z.string().max(160).optional(),
        stage: z.enum(["new", "contacted", "replied", "visit_booked", "quoted", "won", "lost"]).optional(),
        notes: z.string().max(5000).optional(),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: writeAnnotations,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["pipeline:write"] }] },
    },
    async ({ idempotencyKey, ...input }) => {
      requireScope(context, "pipeline:write");
      const result = await idempotentTool(
        context,
        "upsert_pipeline_lead",
        idempotencyKey,
        () => upsertPipelineLead({ companyId: context.company.id, ...input }),
      );
      return toolResult({ lead: result });
    },
  );

  server.registerTool(
    "update_pipeline_lead",
    {
      description: "Update a tenant-scoped pipeline lead's stage, notes, label, or assignee.",
      inputSchema: {
        leadId: z.string().min(1),
        stage: z.enum(["new", "contacted", "replied", "visit_booked", "quoted", "won", "lost"]).optional(),
        notes: z.string().max(5000).nullable().optional(),
        workLabel: z.string().max(160).nullable().optional(),
        lostReason: z.string().max(500).nullable().optional(),
        assignedUserId: z.string().nullable().optional(),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: writeAnnotations,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["pipeline:write"] }] },
    },
    async ({ leadId, idempotencyKey, ...changes }) => {
      requireScope(context, "pipeline:write");
      const existing = await prisma.pipelineLead.findFirst({
        where: { id: leadId, companyId: context.company.id },
      });
      if (!existing) throw new Error("Pipeline lead not found");
      if (changes.assignedUserId) {
        const member = await prisma.membership.findUnique({
          where: {
            userId_companyId: {
              userId: changes.assignedUserId,
              companyId: context.company.id,
            },
          },
        });
        if (!member) throw new Error("Assignee is not a workspace member");
      }
      const lead = await idempotentTool(
        context,
        "update_pipeline_lead",
        idempotencyKey,
        () =>
          prisma.pipelineLead.update({
            where: { id: leadId },
            data: {
              ...changes,
              ...(changes.stage && changes.stage !== existing.stage
                ? { stageUpdatedAt: new Date() }
                : {}),
              ...(changes.assignedUserId !== undefined
                ? {
                    assignedAt: changes.assignedUserId ? new Date() : null,
                    assignedById: context.user.id,
                  }
                : {}),
            },
          }),
      );
      return toolResult({ lead });
    },
  );

  server.registerTool(
    "list_pinned_applications",
    {
      description: "List planning applications tracked by this workspace.",
      annotations: { ...writeAnnotations, readOnlyHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:read"] }] },
    },
    async () => {
      requireScope(context, "workspace:read");
      const features = getCompanyPlanFeatures(context.company);
      requireFeature(features.canPinApplications, "Pinned applications require Pro or higher");
      return toolResult({
        pinnedApplications: await prisma.pinnedApplication.findMany({
          where: { companyId: context.company.id },
          orderBy: { createdAt: "desc" },
        }),
      });
    },
  );

  server.registerTool(
    "pin_application",
    {
      description: "Track a planning application and optionally send change notifications.",
      inputSchema: {
        reference: z.string().min(1).max(160),
        councilId: z.string().max(120).nullable().optional(),
        planningEntity: z.number().int().nullable().optional(),
        siteAddress: z.string().max(500).nullable().optional(),
        description: z.string().max(3000).nullable().optional(),
        status: z.string().max(120).nullable().optional(),
        sourceUrl: z.string().url().nullable().optional(),
        frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]).default("daily"),
        notifyEmails: z.array(z.string().email()).max(20).optional(),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: writeAnnotations,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:write"] }] },
    },
    async ({ idempotencyKey, ...input }) => {
      requireScope(context, "workspace:write");
      const features = getCompanyPlanFeatures(context.company);
      requireFeature(features.canPinApplications, "Pinned applications require Pro or higher");
      const plan = getCompanyPlan(context.company);
      const pinned = await idempotentTool(context, "pin_application", idempotencyKey, () =>
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM companies WHERE id = ${context.company.id} FOR UPDATE`,
          );
          const existing = await tx.pinnedApplication.findFirst({
            where: {
              companyId: context.company.id,
              reference: input.reference,
              councilId: input.councilId ?? null,
            },
          });
          if (existing) return existing;
          const count = await tx.pinnedApplication.count({
            where: { companyId: context.company.id },
          });
          if (count >= plan.pinnedApplicationLimit) {
            throw new Error("Pinned application limit reached");
          }
          return tx.pinnedApplication.create({
            data: {
              companyId: context.company.id,
              userId: context.user.id,
              reference: input.reference.trim(),
              councilId: input.councilId ?? null,
              planningEntity:
                input.planningEntity == null
                  ? null
                  : BigInt(input.planningEntity),
              siteAddress: input.siteAddress ?? null,
              description: input.description ?? null,
              status: input.status ?? null,
              sourceUrl: input.sourceUrl ?? null,
              frequency: input.frequency,
              notifyEmails:
                input.notifyEmails ??
                (context.user.email ? [context.user.email] : []),
              nextCheckAt: new Date(),
            },
          });
        }),
      );
      return toolResult({ pinnedApplication: pinned });
    },
  );

  server.registerTool(
    "list_saved_searches",
    {
      description: "List saved planning searches in this workspace.",
      annotations: { ...writeAnnotations, readOnlyHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:read"] }] },
    },
    async () => {
      requireScope(context, "workspace:read");
      const features = getCompanyPlanFeatures(context.company);
      requireFeature(features.canSaveSearches, "Saved searches require Pro or higher");
      return toolResult({
        searches: await prisma.savedSearch.findMany({
          where: { companyId: context.company.id },
          orderBy: { createdAt: "desc" },
        }),
      });
    },
  );

  server.registerTool(
    "create_saved_search",
    {
      description: "Create a recurring planning search in this workspace.",
      inputSchema: {
        name: z.string().min(1).max(160),
        bbox: z.object({
          west: z.number(),
          south: z.number(),
          east: z.number(),
          north: z.number(),
        }),
        filters: z.record(z.unknown()).default({}),
        frequency: z.enum(["daily", "weekly"]).default("weekly"),
        notifyEmails: z.array(z.string().email()).max(20).optional(),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: writeAnnotations,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:write"] }] },
    },
    async ({ idempotencyKey, ...input }) => {
      requireScope(context, "workspace:write");
      const features = getCompanyPlanFeatures(context.company);
      requireFeature(features.canSaveSearches, "Saved searches require Pro or higher");
      const limit = getCompanyPlan(context.company).savedSearchLimit;
      const search = await idempotentTool(context, "create_saved_search", idempotencyKey, () =>
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM companies WHERE id = ${context.company.id} FOR UPDATE`,
          );
          const count = await tx.savedSearch.count({
            where: { companyId: context.company.id },
          });
          if (count >= limit) throw new Error("Saved search limit reached");
          return tx.savedSearch.create({
            data: {
              companyId: context.company.id,
              name: input.name.trim(),
              bbox: input.bbox,
              filters: input.filters as Prisma.InputJsonObject,
              frequency: input.frequency,
              notifyEmails:
                input.notifyEmails ??
                (context.user.email ? [context.user.email] : []),
            },
          });
        }),
      );
      return toolResult({ search });
    },
  );

  server.registerTool(
    "list_letters",
    {
      description: "List non-deleted letters in this workspace.",
      inputSchema: {
        status: z.string().max(40).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: { ...writeAnnotations, readOnlyHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["letters:read"] }] },
    },
    async ({ status, limit }) => {
      requireScope(context, "letters:read");
      return toolResult({
        letters: await prisma.letter.findMany({
          where: {
            companyId: context.company.id,
            deletedAt: null,
            ...(status ? { status } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
        }),
      });
    },
  );

  server.registerTool(
    "create_letter_draft",
    {
      description: "Render and persist a tenant-scoped letter draft using workspace branding and templates.",
      inputSchema: {
        addresseeName: z.string().max(200).default("Sir or Madam"),
        addressLines: z.string().min(1).max(1000),
        reference: z.string().max(160).optional(),
        description: z.string().max(4000).optional(),
        planningUrl: z.string().url().optional(),
        siteAddress: z.string().max(500).optional(),
        planningEntity: z.number().int().optional(),
        templateId: z.string().optional(),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: writeAnnotations,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["letters:write"] }] },
    },
    async ({ idempotencyKey, templateId, ...input }) => {
      requireScope(context, "letters:write");
      const rate = await checkRateLimit("letter", context.user.id);
      if (!rate.ok) throw new Error("Letter generation rate limit exceeded");
      const template = templateId
        ? await prisma.letterTemplate.findFirst({
            where: { id: templateId, companyId: context.company.id },
          })
        : await prisma.letterTemplate.findFirst({
            where: { companyId: context.company.id, kind: "outreach" },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          });
      const rendered = renderLetterHtml({
        company: context.company,
        user: context.user,
        addresseeName: input.addresseeName,
        addressLines: input.addressLines,
        reference: input.reference ?? "",
        description: input.description ?? "",
        planningUrl: input.planningUrl ?? "",
        siteAddress: input.siteAddress ?? "",
        templateBodyHtml: template?.bodyHtml ?? null,
        templateSubject: template?.subject ?? null,
      });
      const letter = await idempotentTool(context, "create_letter_draft", idempotencyKey, () =>
        prisma.letter.create({
          data: {
            companyId: context.company.id,
            userId: context.user.id,
            applicationRef: input.reference ?? null,
            planningEntity: input.planningEntity == null ? null : BigInt(input.planningEntity),
            siteAddress: input.siteAddress ?? null,
            recipientName: input.addresseeName,
            addressLines: input.addressLines,
            subject: rendered.subject,
            bodyHtml: rendered.body,
            status: "draft",
          },
        }),
      );
      return toolResult({ letter, renderedHtml: rendered.html });
    },
  );

  server.registerTool(
    "update_letter_draft",
    {
      description: "Update the editable fields of a letter draft.",
      inputSchema: {
        letterId: z.string().min(1),
        recipientName: z.string().max(200).optional(),
        addressLines: z.string().max(1000).optional(),
        subject: z.string().max(300).optional(),
        bodyHtml: z.string().max(100000).optional(),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: writeAnnotations,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["letters:write"] }] },
    },
    async ({ letterId, idempotencyKey, bodyHtml, ...changes }) => {
      requireScope(context, "letters:write");
      const existing = await prisma.letter.findFirst({
        where: { id: letterId, companyId: context.company.id, deletedAt: null },
      });
      if (!existing) throw new Error("Letter not found");
      if (bodyHtml !== undefined && !isBodyOnlyHtml(bodyHtml)) {
        throw new Error("bodyHtml must be a body-only HTML fragment");
      }
      const letter = await idempotentTool(context, "update_letter_draft", idempotencyKey, () =>
        prisma.letter.update({
          where: { id: letterId },
          data: {
            ...changes,
            ...(bodyHtml !== undefined ? { bodyHtml: sanitizeHtmlFragment(bodyHtml) } : {}),
            status: "draft",
          },
        }),
      );
      return toolResult({ letter });
    },
  );

  server.registerTool(
    "list_reminders",
    {
      description: "List reminders for the current user in this workspace.",
      inputSchema: { includeDone: z.boolean().default(false) },
      annotations: { ...writeAnnotations, readOnlyHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:read"] }] },
    },
    async ({ includeDone }) => {
      requireScope(context, "workspace:read");
      return toolResult({
        reminders: await prisma.reminder.findMany({
          where: {
            companyId: context.company.id,
            userId: context.user.id,
            ...(includeDone ? {} : { done: false }),
          },
          orderBy: { dueAt: "asc" },
        }),
      });
    },
  );

  server.registerTool(
    "create_reminder",
    {
      description: "Create a personal workspace reminder, optionally linked to a letter.",
      inputSchema: {
        dueAt: z.string().datetime(),
        note: z.string().max(1000).optional(),
        letterId: z.string().optional(),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: writeAnnotations,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:write"] }] },
    },
    async ({ idempotencyKey, ...input }) => {
      requireScope(context, "workspace:write");
      if (input.letterId) {
        const letter = await prisma.letter.findFirst({
          where: { id: input.letterId, companyId: context.company.id },
        });
        if (!letter) throw new Error("Letter not found");
      }
      const reminder = await idempotentTool(context, "create_reminder", idempotencyKey, () =>
        prisma.reminder.create({
          data: {
            companyId: context.company.id,
            userId: context.user.id,
            letterId: input.letterId,
            dueAt: new Date(input.dueAt),
            note: input.note,
          },
        }),
      );
      return toolResult({ reminder });
    },
  );

  server.registerTool(
    "manage_pinned_application",
    {
      description: "Update notification settings or remove one tracked planning application.",
      inputSchema: {
        pinnedApplicationId: z.string().min(1),
        action: z.enum(["update", "remove"]),
        frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
        paused: z.boolean().optional(),
        notifyEmails: z.array(z.string().email()).max(20).optional(),
        confirmRemoval: z.boolean().default(false),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: { ...writeAnnotations, destructiveHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:write"] }] },
    },
    async ({ pinnedApplicationId, action, confirmRemoval, idempotencyKey, ...changes }) => {
      requireScope(context, "workspace:write");
      const existing = await prisma.pinnedApplication.findFirst({
        where: { id: pinnedApplicationId, companyId: context.company.id },
      });
      if (!existing) throw new Error("Pinned application not found");
      if (action === "remove" && !confirmRemoval) {
        throw new Error("confirmRemoval=true is required");
      }
      const result = await idempotentTool(
        context,
        "manage_pinned_application",
        idempotencyKey,
        async () => {
          if (action === "remove") {
            await prisma.pinnedApplication.delete({ where: { id: existing.id } });
            return { removed: true, id: existing.id };
          }
          return prisma.pinnedApplication.update({
            where: { id: existing.id },
            data: changes,
          });
        },
      );
      return toolResult(result);
    },
  );

  server.registerTool(
    "manage_saved_search",
    {
      description: "Update or remove one saved planning search.",
      inputSchema: {
        savedSearchId: z.string().min(1),
        action: z.enum(["update", "remove"]),
        name: z.string().min(1).max(160).optional(),
        frequency: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
        notifyEmails: z.array(z.string().email()).max(20).optional(),
        autoOutreach: z.boolean().optional(),
        confirmRemoval: z.boolean().default(false),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: { ...writeAnnotations, destructiveHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:write"] }] },
    },
    async ({ savedSearchId, action, confirmRemoval, idempotencyKey, ...changes }) => {
      requireScope(context, "workspace:write");
      const existing = await prisma.savedSearch.findFirst({
        where: { id: savedSearchId, companyId: context.company.id },
      });
      if (!existing) throw new Error("Saved search not found");
      if (changes.autoOutreach && !getCompanyPlanFeatures(context.company).canUseAutoOutreach) {
        throw new Error("Autonomous outreach requires the Agency plan");
      }
      if (action === "remove" && !confirmRemoval) {
        throw new Error("confirmRemoval=true is required");
      }
      const result = await idempotentTool(
        context,
        "manage_saved_search",
        idempotencyKey,
        async () => {
          if (action === "remove") {
            await prisma.savedSearch.delete({ where: { id: existing.id } });
            return { removed: true, id: existing.id };
          }
          return prisma.savedSearch.update({
            where: { id: existing.id },
            data: changes,
          });
        },
      );
      return toolResult(result);
    },
  );

  server.registerTool(
    "get_letter",
    {
      description: "Get one letter, its reminders, and any stored PDF URL.",
      inputSchema: { letterId: z.string().min(1) },
      annotations: { ...writeAnnotations, readOnlyHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["letters:read"] }] },
    },
    async ({ letterId }) => {
      requireScope(context, "letters:read");
      const letter = await prisma.letter.findFirst({
        where: { id: letterId, companyId: context.company.id, deletedAt: null },
        include: { reminders: true },
      });
      if (!letter) throw new Error("Letter not found");
      return toolResult({ letter });
    },
  );
}
