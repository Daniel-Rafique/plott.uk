import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  McpAuthError,
  mcpChallenge,
  requireMcpContext,
} from "@/lib/mcp/auth-context";
import { createPlottMcpServer } from "@/lib/mcp/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordOAuthAudit } from "@/lib/mcp/oauth/audit";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const maxDuration = 180;

async function handle(request: Request) {
  let context;
  try {
    context = await requireMcpContext(request);
  } catch (error) {
    const authError =
      error instanceof McpAuthError
        ? error
        : new McpAuthError("Authentication failed");
    return Response.json(
      { error: authError.code, error_description: authError.message },
      {
        status: authError.status,
        headers: {
          "www-authenticate": mcpChallenge(),
          "cache-control": "no-store",
        },
      },
    );
  }

  const limited = await checkRateLimit(
    "mcpInvoke",
    `${context.company.id}:${context.clientId}`,
  );
  if (!limited.ok) return rateLimitResponse(limited.retryAfterMs);

  let parsedBody: unknown;
  let toolName: string | undefined;
  if (request.method === "POST") {
    parsedBody = await request.json().catch(() => undefined);
    if (
      parsedBody &&
      typeof parsedBody === "object" &&
      "method" in parsedBody &&
      parsedBody.method === "tools/call" &&
      "params" in parsedBody
    ) {
      const params = parsedBody.params;
      if (params && typeof params === "object" && "name" in params) {
        toolName = String(params.name);
      }
    }
  }

  const server = createPlottMcpServer(context);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      ...(parsedBody !== undefined ? { parsedBody } : {}),
    });
    await recordOAuthAudit({
      event: "tool_call",
      outcome: response.ok ? "success" : "error",
      clientId: context.clientId,
      userId: context.user.id,
      companyId: context.company.id,
      jti: context.jti,
      toolName,
    });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    captureError(error, {
      userId: context.user.id,
      companyId: context.company.id,
      extra: { surface: "mcp", toolName },
    });
    await recordOAuthAudit({
      event: "tool_call",
      outcome: "error",
      clientId: context.clientId,
      userId: context.user.id,
      companyId: context.company.id,
      jti: context.jti,
      toolName,
    });
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal MCP error" },
        id: null,
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers":
        "authorization, content-type, mcp-protocol-version, mcp-session-id",
      "access-control-max-age": "86400",
    },
  });
}
