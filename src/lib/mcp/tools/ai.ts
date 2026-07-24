import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpAuthContext } from "@/lib/mcp/auth-context";
import { requireScope } from "@/lib/mcp/auth-context";
import { idempotentTool, toolResult } from "@/lib/mcp/result";
import { requireAiEntitlement } from "@/lib/ai/entitlements";
import type { AgentKind } from "@/lib/ai/router";
import { parseNlSearch } from "@/lib/ai/nl-search-parse";
import { researchApplicant } from "@/lib/ai/agents/research-briefing";
import { runComplianceGuardrail } from "@/lib/ai/agents/compliance";
import { estimateJob } from "@/lib/ai/agents/job-estimator";
import { resolveOutreachContact } from "@/lib/outreach-contact";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  addressMatchUprn,
  landRegistryDocuments,
  titleDetails,
  uprnTitle,
} from "@/lib/propertydata";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import {
  approveOutreach,
  rejectOutreach,
  sendApprovedOutreach,
} from "@/lib/mcp/outreach-actions";

async function ensureAi(context: McpAuthContext, kind: AgentKind) {
  requireScope(context, "ai:invoke");
  const gate = await requireAiEntitlement(context, kind);
  if (!gate.ok) {
    const body = (await gate.response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(body?.error ?? "AI feature is not available");
  }
}

function pickTitle(input: Awaited<ReturnType<typeof uprnTitle>>) {
  return (
    input.freehold ||
    input.leasehold?.[0] ||
    input.title ||
    input.titles?.[0] ||
    null
  );
}

export function registerAiTools(server: McpServer, context: McpAuthContext) {
  server.registerTool(
    "parse_planning_query",
    {
      description: "Use Plott AI to turn natural language into structured planning filters.",
      inputSchema: { prompt: z.string().min(2).max(400) },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:invoke"] }] },
    },
    async ({ prompt }) => {
      await ensureAi(context, "nl_search");
      const rate = await checkRateLimit("aiNlSearch", context.company.id);
      if (!rate.ok) throw new Error("AI search rate limit exceeded");
      const result = await parseNlSearch({
        prompt,
        companyId: context.company.id,
        userId: context.user.id,
      });
      return toolResult({
        filters: result.data,
        runId: result.runId,
        costGbp: result.costGbp,
      });
    },
  );

  server.registerTool(
    "research_applicant",
    {
      description: "Run or retrieve a tenant-scoped AI research briefing for an applicant.",
      inputSchema: {
        name: z.string().min(2).max(200),
        hint: z.string().max(400).optional(),
        email: z.string().email().optional(),
        force: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:invoke"] }] },
    },
    async (input) => {
      await ensureAi(context, "applicant_research");
      const rate = await checkRateLimit("aiResearch", context.company.id);
      if (!rate.ok) throw new Error("Applicant research rate limit exceeded");
      return toolResult(
        await researchApplicant({
          ctx: { companyId: context.company.id, userId: context.user.id },
          displayName: input.name,
          hint: input.hint,
          email: input.email ?? null,
          force: input.force,
        }),
      );
    },
  );

  server.registerTool(
    "check_outreach_compliance",
    {
      description: "Check a proposed print or email outreach message before approval or sending.",
      inputSchema: {
        subject: z.string().max(300),
        bodyHtml: z.string().max(100000),
        channel: z.enum(["email", "print"]),
        recipientKind: z.enum(["applicant", "agent"]).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:invoke"] }] },
    },
    async (input) => {
      await ensureAi(context, "compliance_guardrail");
      return toolResult(
        await runComplianceGuardrail({
          ctx: { companyId: context.company.id, userId: context.user.id },
          ...input,
          letterPurpose: "planning_b2b_outreach",
        }),
      );
    },
  );

  server.registerTool(
    "estimate_planning_job",
    {
      description: "Create an indicative construction estimate grounded in the workspace rate card.",
      inputSchema: {
        planningEntity: z.number().int(),
        reference: z.string().min(1).max(160),
        siteAddress: z.string().max(500).nullable(),
        description: z.string().max(5000).nullable(),
        status: z.string().max(120).nullable().optional(),
        applicationType: z.string().max(160).nullable().optional(),
        areaSqm: z.number().positive().optional(),
        storeys: z.number().int().positive().optional(),
        complexity: z.enum(["low", "medium", "high"]).optional(),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:invoke"] }] },
    },
    async ({ areaSqm, storeys, complexity, ...candidate }) => {
      await ensureAi(context, "job_estimator");
      return toolResult(
        await estimateJob({
          ctx: { companyId: context.company.id, userId: context.user.id },
          candidate,
          overrides: { areaSqm, storeys, complexity },
        }),
      );
    },
  );

  server.registerTool(
    "resolve_outreach_contact",
    {
      description: "Resolve an allowlisted applicant or agent contact bundle with provenance.",
      inputSchema: {
        reference: z.string().min(1).max(160),
        planningEntity: z.number().int(),
        siteAddress: z.string().max(500).nullable().optional(),
        forceRefresh: z.boolean().default(false),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["enrichment:read"] }] },
    },
    async (input) => {
      requireScope(context, "enrichment:read");
      const rate = await checkRateLimit("outreachContact", context.company.id);
      if (!rate.ok) throw new Error("Contact resolution rate limit exceeded");
      const bundle = await resolveOutreachContact({
        ctx: { companyId: context.company.id, userId: context.user.id },
        reference: input.reference,
        planningEntity: input.planningEntity,
        siteAddress: input.siteAddress,
        forceRefresh: input.forceRefresh,
      });
      const enrichment = bundle.enrichment;
      return toolResult({
        reference: bundle.reference,
        planningEntity: bundle.planningEntity,
        siteAddress: bundle.siteAddress,
        candidates: bundle.candidates.map((candidate) => ({
          kind: candidate.kind,
          name: candidate.name,
          addressLines: candidate.addressLines,
          email: candidate.email,
          phone: candidate.phone,
          source: candidate.source,
          confidence: candidate.confidence,
        })),
        enrichment: enrichment
          ? {
              applicantName: enrichment.applicantName,
              applicantAddress: enrichment.applicantAddress,
              applicantEmail: enrichment.applicantEmail,
              applicantEmailSource: enrichment.applicantEmailSource,
              applicantEmailConfidence: enrichment.applicantEmailConfidence,
              applicantEmailStatus: enrichment.applicantEmailStatus,
              agentName: enrichment.agentName,
              agentAddress: enrichment.agentAddress,
              agentEmail: enrichment.agentEmail,
              agentEmailSource: enrichment.agentEmailSource,
              agentEmailConfidence: enrichment.agentEmailConfidence,
              agentEmailStatus: enrichment.agentEmailStatus,
            }
          : null,
        caseOfficer: bundle.caseOfficer,
        ward: bundle.ward,
        sources: bundle.sources,
        confidence: bundle.confidence,
      });
    },
  );

  server.registerTool(
    "lookup_property_title",
    {
      description: "Run a metered PropertyData UPRN/title lookup without purchasing documents.",
      inputSchema: { address: z.string().min(5).max(1000) },
      annotations: { readOnlyHint: true, openWorldHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["property:read"] }] },
    },
    async ({ address }) => {
      requireScope(context, "property:read");
      const rate = await checkRateLimit("proprietor", context.user.id);
      if (!rate.ok) throw new Error("Property lookup rate limit exceeded");
      const match = await addressMatchUprn(address);
      const first = match.results?.[0];
      if (!first?.uprn) return toolResult({ match: null });
      const title = pickTitle(await uprnTitle(String(first.uprn)));
      return toolResult({
        uprn: String(first.uprn),
        matchedAddress: first.address ?? null,
        titleNumber: title,
        title: title ? await titleDetails(title) : null,
        documentsPurchased: false,
      });
    },
  );

  server.registerTool(
    "list_outreach_approvals",
    {
      description: "List tenant-scoped AI outreach approvals and their current status.",
      inputSchema: {
        status: z.enum(["pending", "approved", "rejected", "sent"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["outreach:read"] }] },
    },
    async ({ status, limit }) => {
      requireScope(context, "outreach:read");
      const features = getCompanyPlanFeatures(context.company);
      if (!features.canUseAutoOutreach) throw new Error("Outreach requires the Agency plan");
      return toolResult({
        approvals: await prisma.agentApproval.findMany({
          where: { companyId: context.company.id, ...(status ? { status } : {}) },
          orderBy: { createdAt: "desc" },
          take: limit,
        }),
      });
    },
  );

  server.registerTool(
    "purchase_property_documents",
    {
      description: "Purchase a Land Registry extract for a known title. This incurs an external charge.",
      inputSchema: {
        titleNumber: z.string().min(1).max(80),
        documents: z.enum(["register", "plan", "both"]).default("both"),
        extractProprietorData: z.boolean().default(true),
        confirmExternalCharge: z.literal(true),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["property:read"] }] },
    },
    async ({ titleNumber, documents, extractProprietorData, idempotencyKey }) => {
      requireScope(context, "property:read");
      const rate = await checkRateLimit("proprietor", context.user.id);
      if (!rate.ok) throw new Error("Property lookup rate limit exceeded");
      const result = await idempotentTool(
        context,
        "purchase_property_documents",
        idempotencyKey,
        () =>
          landRegistryDocuments({
            title: titleNumber,
            documents,
            extract_proprietor_data: extractProprietorData,
            allow_repurchases: false,
          }),
      );
      return toolResult(result);
    },
  );

  server.registerTool(
    "decide_outreach_approval",
    {
      description: "Approve and materialize, or reject, a pending outreach draft.",
      inputSchema: {
        approvalId: z.string().min(1),
        decision: z.enum(["approve", "reject"]),
        rejectionNote: z.string().max(500).optional(),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["outreach:write"] }] },
    },
    async ({ approvalId, decision, rejectionNote, idempotencyKey }) => {
      requireScope(context, "outreach:write");
      const features = getCompanyPlanFeatures(context.company);
      if (!features.canUseAutoOutreach) throw new Error("Outreach requires the Agency plan");
      const result = await idempotentTool(
        context,
        "decide_outreach_approval",
        idempotencyKey,
        async (): Promise<unknown> => {
          if (decision === "approve") {
            return approveOutreach(context, approvalId);
          }
          return rejectOutreach(context, approvalId, rejectionNote);
        },
      );
      return toolResult(result);
    },
  );

  server.registerTool(
    "send_approved_outreach",
    {
      description: "Send one already-approved outreach email. Requires explicit confirmation.",
      inputSchema: {
        approvalId: z.string().min(1),
        confirmExternalSideEffect: z.literal(true),
        forceContact: z.boolean().default(false),
        idempotencyKey: z.string().min(8).max(160),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["outreach:write"] }] },
    },
    async ({ approvalId, forceContact, idempotencyKey }) => {
      requireScope(context, "outreach:write");
      const features = getCompanyPlanFeatures(context.company);
      if (!features.canUseAutoOutreach) throw new Error("Outreach requires the Agency plan");
      const result = await idempotentTool(
        context,
        "send_approved_outreach",
        idempotencyKey,
        () => sendApprovedOutreach(context, approvalId, forceContact),
      );
      return toolResult(result);
    },
  );
}
