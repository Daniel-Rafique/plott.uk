import { oauthConfig, OAUTH_SCOPES } from "@/lib/mcp/oauth/config";

export const runtime = "nodejs";

export function GET() {
  const config = oauthConfig();
  return Response.json({
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: Object.keys(OAUTH_SCOPES),
    bearer_methods_supported: ["header"],
    resource_name: "Plott MCP",
  });
}
