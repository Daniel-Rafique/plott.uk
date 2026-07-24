import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "@/lib/prisma";
import type { McpAuthContext } from "@/lib/mcp/auth-context";
import { requireScope } from "@/lib/mcp/auth-context";
import { toolResult } from "@/lib/mcp/result";
import {
  fetchPlanwireApplication,
  fetchPlanwireApplicationsByBbox,
  fetchPlanwireApplicationsByQuery,
  mapPlanwireToPlanningEntity,
} from "@/lib/planwire";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCompanyPlanFeatures } from "@/lib/plan-features";
import { getCompanyPlan } from "@/lib/pricing";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function registerCoreTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.registerTool(
    "get_workspace_profile",
    {
      description: "Get the authorized Plott workspace, role, plan, and capabilities.",
      annotations: readOnly,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:read"] }] },
    },
    async () => {
      requireScope(context, "workspace:read");
      return toolResult({
        workspace: {
          id: context.company.id,
          name: context.company.name,
          addressLines: context.company.addressLines,
          phone: context.company.phone,
          email: context.company.email,
          websiteUrl: context.company.websiteUrl,
          role: context.membership.role,
        },
        plan: getCompanyPlan(context.company),
        features: getCompanyPlanFeatures(context.company),
      });
    },
  );

  server.registerTool(
    "get_dashboard_state",
    {
      description: "Get the current user's saved planning-map dashboard state.",
      annotations: readOnly,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["workspace:read"] }] },
    },
    async () => {
      requireScope(context, "workspace:read");
      return toolResult({ dashboardState: context.user.dashboardState });
    },
  );

  server.registerTool(
    "list_workspace_templates",
    {
      description: "List letter templates available in the authorized workspace.",
      inputSchema: { kind: z.enum(["outreach", "appeal_pitch"]).optional() },
      annotations: readOnly,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["letters:read"] }] },
    },
    async ({ kind }) => {
      requireScope(context, "letters:read");
      return toolResult({
        templates: await prisma.letterTemplate.findMany({
          where: { companyId: context.company.id, ...(kind ? { kind } : {}) },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        }),
      });
    },
  );

  server.registerTool(
    "search_planning_applications",
    {
      description: "Search UK planning applications by text, council, postcode, status, type, or date.",
      inputSchema: {
        query: z.string().max(300).optional(),
        council: z.string().max(120).optional(),
        postcode: z.string().max(16).optional(),
        status: z.enum(["Pending", "Approved", "Refused", "Withdrawn"]).optional(),
        type: z.string().max(120).optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { ...readOnly, openWorldHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["planning:read"] }] },
    },
    async (input) => {
      requireScope(context, "planning:read");
      const rate = await checkRateLimit("search", context.user.id);
      if (!rate.ok) throw new Error("Planning search rate limit exceeded");
      const applications = await fetchPlanwireApplicationsByQuery({
        q: input.query,
        council: input.council,
        postcode: input.postcode,
        status: input.status,
        type: input.type,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        page: input.page,
        limit: input.limit,
      });
      return toolResult({
        applications: applications.map(mapPlanwireToPlanningEntity),
      });
    },
  );

  server.registerTool(
    "nearby_planning_applications",
    {
      description: "Search planning applications within a map bounding box.",
      inputSchema: {
        west: z.number().min(-9).max(3),
        south: z.number().min(49).max(61),
        east: z.number().min(-9).max(3),
        north: z.number().min(49).max(61),
        limit: z.number().int().min(1).max(100).default(50),
      },
      annotations: { ...readOnly, openWorldHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["planning:read"] }] },
    },
    async (input) => {
      requireScope(context, "planning:read");
      const rate = await checkRateLimit("search", context.user.id);
      if (!rate.ok) throw new Error("Planning search rate limit exceeded");
      const applications = await fetchPlanwireApplicationsByBbox(input);
      return toolResult({
        applications: applications.map(mapPlanwireToPlanningEntity),
      });
    },
  );

  server.registerTool(
    "get_planning_application",
    {
      description: "Get one planning application by authority reference.",
      inputSchema: {
        reference: z.string().min(1).max(160),
        councilId: z.string().max(120).optional(),
      },
      annotations: { ...readOnly, openWorldHint: true },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["planning:read"] }] },
    },
    async ({ reference, councilId }) => {
      requireScope(context, "planning:read");
      const application = await fetchPlanwireApplication({ reference, councilId });
      return toolResult({
        application: application ? mapPlanwireToPlanningEntity(application) : null,
      });
    },
  );

  server.registerTool(
    "get_agent_run",
    {
      description: "Poll the status and result of an AI job created in this workspace.",
      inputSchema: { runId: z.string().min(1) },
      annotations: readOnly,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["ai:invoke"] }] },
    },
    async ({ runId }) => {
      requireScope(context, "ai:invoke");
      const run = await prisma.agentRun.findFirst({
        where: { id: runId, companyId: context.company.id },
      });
      return toolResult({ run });
    },
  );

  server.registerResource(
    "workspace-profile",
    `plott://workspace/${context.company.id}/profile`,
    { mimeType: "application/json", description: "Authorized workspace profile" },
    async (uri) => {
      requireScope(context, "workspace:read");
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify({
              id: context.company.id,
              name: context.company.name,
              role: context.membership.role,
            }),
          },
        ],
      };
    },
  );

  server.registerResource(
    "workspace-icp",
    `plott://workspace/${context.company.id}/icp`,
    { mimeType: "application/json", description: "Workspace ideal customer profile" },
    async (uri) => {
      requireScope(context, "workspace:read");
      const profile = await prisma.icpProfile.findUnique({
        where: { companyId: context.company.id },
      });
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(profile),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "planning_research",
    {
      description: "Build a grounded workflow for researching a planning opportunity.",
      argsSchema: { objective: z.string().max(500).optional() },
    },
    ({ objective }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Research UK planning opportunities for this Plott workspace. Use planning tools first, cite application references, and do not infer personal contact data. Objective: ${objective ?? "find relevant opportunities"}.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "compliant_outreach_letter",
    {
      description: "Draft a factual, compliant B2B planning outreach letter.",
      argsSchema: { applicationReference: z.string(), goal: z.string().max(500) },
    },
    ({ applicationReference, goal }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Prepare a factual B2B outreach letter for planning application ${applicationReference}. Goal: ${goal}. Use Plott's contact and compliance tools, avoid unsupported claims, and do not send anything without explicit approval.`,
          },
        },
      ],
    }),
  );
}
