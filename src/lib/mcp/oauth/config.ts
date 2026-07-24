export const OAUTH_SCOPES = {
  openid: "Identify the signed-in Plott user",
  profile: "Read the user's display name",
  email: "Read the user's email address",
  mcp: "Connect an MCP client to Plott",
  "planning:read": "Search and inspect planning applications",
  "workspace:read": "Read workspace profile, settings, and dashboard data",
  "workspace:write": "Manage pins, saved searches, and reminders",
  "pipeline:read": "Read pipeline leads",
  "pipeline:write": "Create and update pipeline leads",
  "letters:read": "Read letters and templates",
  "letters:write": "Create, update, and render letters",
  "enrichment:read": "Resolve allowlisted applicant and agent contact data",
  "property:read": "Run paid property proprietor lookups",
  "ai:invoke": "Run subscribed Plott AI workflows",
  "outreach:read": "Read and preview outreach approvals",
  "outreach:write": "Approve and send explicitly confirmed outreach",
  offline_access: "Refresh access without signing in again",
} as const;

export type OAuthScope = keyof typeof OAUTH_SCOPES;

export const ALLOWED_SCOPES = new Set<OAuthScope>(
  Object.keys(OAUTH_SCOPES) as OAuthScope[],
);

export const DEFAULT_SCOPES: OAuthScope[] = [
  "mcp",
  "planning:read",
  "workspace:read",
  "pipeline:read",
  "letters:read",
];

const NON_PRODUCT_SCOPES = new Set<OAuthScope>([
  "openid",
  "profile",
  "email",
  "mcp",
  "offline_access",
]);

export function isDynamicClientRegistrationEnabled(): boolean {
  return process.env.MCP_OAUTH_DCR_ENABLED === "true";
}

function publicOrigin(): string {
  const configured =
    process.env.MCP_OAUTH_PUBLIC_ORIGIN || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("MCP_OAUTH_PUBLIC_ORIGIN or NEXT_PUBLIC_APP_URL is required");
  }
  return "http://localhost:3000";
}

export function oauthConfig() {
  const origin = publicOrigin();
  return {
    origin,
    issuer: origin,
    resource: `${origin}/api/mcp`,
    authorizationEndpoint: `${origin}/oauth/authorize`,
    tokenEndpoint: `${origin}/api/oauth/token`,
    registrationEndpoint: `${origin}/api/oauth/register`,
    revocationEndpoint: `${origin}/api/oauth/revoke`,
    jwksUri: `${origin}/api/oauth/jwks`,
    protectedResourceMetadata: `${origin}/.well-known/oauth-protected-resource`,
    accessTokenTtlSeconds: Number(process.env.MCP_OAUTH_ACCESS_TOKEN_TTL || 600),
    refreshTokenTtlSeconds: Number(
      process.env.MCP_OAUTH_REFRESH_TOKEN_TTL || 60 * 60 * 24 * 30,
    ),
    authorizationCodeTtlSeconds: 300,
  };
}

export function normalizeScopes(value: string | null | undefined): OAuthScope[] {
  const requested = (value ?? "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const invalid = requested.filter(
    (scope): scope is string => !ALLOWED_SCOPES.has(scope as OAuthScope),
  );
  if (invalid.length) {
    throw new Error(`Unsupported scope: ${invalid.join(", ")}`);
  }

  const typedRequested = requested as OAuthScope[];
  const hasProductScope = typedRequested.some(
    (scope) => !NON_PRODUCT_SCOPES.has(scope),
  );
  const scopes =
    typedRequested.length === 0
      ? DEFAULT_SCOPES
      : hasProductScope
        ? typedRequested
        : [...typedRequested, ...DEFAULT_SCOPES];

  // The resource is an MCP endpoint, so every authorization must carry the
  // connection marker. This marker grants no product data access by itself.
  return [
    "mcp",
    ...new Set(scopes.filter((scope) => scope !== "mcp")),
  ] as OAuthScope[];
}
