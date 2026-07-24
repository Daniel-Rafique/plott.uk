import {
  isDynamicClientRegistrationEnabled,
  oauthConfig,
  OAUTH_SCOPES,
} from "@/lib/mcp/oauth/config";

export const runtime = "nodejs";

export function GET() {
  const config = oauthConfig();
  return Response.json({
    issuer: config.issuer,
    authorization_endpoint: config.authorizationEndpoint,
    token_endpoint: config.tokenEndpoint,
    ...(isDynamicClientRegistrationEnabled()
      ? { registration_endpoint: config.registrationEndpoint }
      : {}),
    revocation_endpoint: config.revocationEndpoint,
    jwks_uri: config.jwksUri,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: Object.keys(OAUTH_SCOPES),
    resource_indicators_supported: true,
  });
}
