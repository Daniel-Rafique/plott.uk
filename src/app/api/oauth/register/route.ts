import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  isDynamicClientRegistrationEnabled,
  normalizeScopes,
} from "@/lib/mcp/oauth/config";
import { validateRedirectUris } from "@/lib/mcp/oauth/redirect-uri";
import { randomToken } from "@/lib/mcp/oauth/tokens";
import { recordOAuthAudit } from "@/lib/mcp/oauth/audit";

export const runtime = "nodejs";

const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(120).default("MCP client"),
  client_uri: z.string().url().optional(),
  redirect_uris: z.array(z.string()).min(1).max(10),
  token_endpoint_auth_method: z.literal("none").default("none"),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).default(["code"]),
  scope: z.string().optional(),
});

function requestKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  if (!isDynamicClientRegistrationEnabled()) {
    return Response.json(
      {
        error: "registration_unavailable",
        error_description: "Dynamic client registration is not enabled",
      },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  const limited = await checkRateLimit("oauthRegister", requestKey(request));
  if (!limited.ok) return rateLimitResponse(limited.retryAfterMs);

  try {
    const input = registrationSchema.parse(await request.json());
    const redirectUris = validateRedirectUris(input.redirect_uris);
    const scopes = normalizeScopes(input.scope);
    const clientId = `plott_${randomToken(24)}`;
    await prisma.oAuthClient.create({
      data: {
        clientId,
        clientName: input.client_name,
        clientUri: input.client_uri,
        redirectUris,
        tokenEndpointAuthMethod: "none",
        grantTypes: input.grant_types,
        responseTypes: input.response_types,
        scopes,
      },
    });
    await recordOAuthAudit({
      event: "client_registered",
      outcome: "success",
      clientId,
      metadata: { clientName: input.client_name },
    });
    return Response.json(
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: input.client_name,
        client_uri: input.client_uri,
        redirect_uris: redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: input.grant_types,
        response_types: input.response_types,
        scope: scopes.join(" "),
      },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error: "invalid_client_metadata",
        error_description:
          error instanceof Error ? error.message : "Invalid registration",
      },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
}
