# Plott remote MCP and OAuth

Plott exposes a tenant-scoped Streamable HTTP MCP endpoint at `/api/mcp`.
Authentication uses Plott's OAuth 2.1 authorization-code flow with mandatory
S256 PKCE and dynamic client registration. Neon Auth remains the human login
and 2FA provider for the consent screen; Neon session cookies are never accepted
by the MCP endpoint.

## Production configuration

Set:

```text
MCP_OAUTH_PUBLIC_ORIGIN=https://plott.uk
MCP_OAUTH_SIGNING_SECRET=<dedicated random secret>
MCP_OAUTH_ACCESS_TOKEN_TTL=600
MCP_OAUTH_REFRESH_TOKEN_TTL=2592000
MCP_OAUTH_DCR_ENABLED=true
```

Generate the signing secret with `openssl rand -base64 48`. Do not reuse the
Neon cookie, cron, workflow, or webhook secrets. Apply the Prisma migration
before enabling the endpoint. Production also requires Upstash Redis because
OAuth and MCP rate limits fail closed without it.

Dynamic client registration is enabled in production so compatible external MCP
clients can register automatically. Setting `MCP_OAUTH_DCR_ENABLED=false`
removes registration from discovery and makes the registration endpoint return
404.

## Discovery and endpoints

- Protected resource: `/.well-known/oauth-protected-resource`
- Authorization server: `/.well-known/oauth-authorization-server`
- Dynamic registration: `/api/oauth/register`
- Authorization/consent: `/oauth/authorize`
- Token: `/api/oauth/token`
- Revocation: `/api/oauth/revoke`
- JWKS: `/api/oauth/jwks`
- MCP resource: `/api/mcp`
- User grant management: `/api/account/integrations/mcp`

Public clients use `token_endpoint_auth_method=none`. Redirect URIs must be
HTTPS, an HTTP loopback URI, or Cursor's registered MCP callback. Authorization
codes are single-use and expire after five minutes. Refresh tokens are hashed,
rotated on every use, and their full family is revoked when reuse is detected.

## Scope groups

- `mcp`: base MCP connection
- `planning:read`: planning search and application details
- `workspace:read`, `workspace:write`: workspace state, pins, searches, reminders
- `pipeline:read`, `pipeline:write`: tenant CRM
- `letters:read`, `letters:write`: templates and letter drafts
- `enrichment:read`: field-allowlisted contact resolution
- `property:read`: metered title lookups and explicitly confirmed purchases
- `ai:invoke`: plan-gated AI workflows
- `outreach:read`, `outreach:write`: approval queue and confirmed sends
- `offline_access`: rotating refresh token

Every grant is bound to one company selected on the consent screen. Runtime
authorization re-checks the current membership, subscription, grant, token
audience, revocation state, and tool scope. Removing a membership or revoking a
grant therefore takes effect without waiting for token expiry.

## Agent Skills

Plott publishes three progressively disclosed workflow skills through the
authenticated MCP Resources capability:

- `skill://research-planning-opportunity/SKILL.md`
- `skill://qualify-planning-lead/SKILL.md`
- `skill://prepare-compliant-outreach/SKILL.md`

Compatible clients can discover them from `skill://index.json`. Each skill
teaches the client how to sequence existing Plott tools while preserving
workspace boundaries, provenance, idempotency, paid-operation warnings and
explicit outreach confirmation. Skills provide instructions only; tools remain
the authorization and execution boundary.

Skills-over-MCP support varies by client. The existing tools and the
`planning_research` and `compliant_outreach_letter` prompts remain available as
fallbacks, so clients are not required to understand the `skill://` convention.

## Client flow

1. Read protected-resource and authorization-server metadata.
2. Register a public client and retain its `client_id`.
3. Generate a PKCE verifier/challenge and open `/oauth/authorize` with
   `response_type=code`, `state`, `resource=https://plott.uk/api/mcp`, scopes,
   and the exact registered redirect URI.
4. Exchange the returned code at `/api/oauth/token` with the verifier, client
   ID, redirect URI, and resource.
5. Send the access token as `Authorization: Bearer ...` to `/api/mcp`.

For clients with built-in remote MCP and OAuth support, add
`https://plott.uk/api/mcp` as the server URL. The client handles discovery,
registration, PKCE and token exchange, while the user signs in to Plott,
selects a workspace and approves the requested permissions.

## Release checklist

1. Run `npx prisma migrate deploy`, `npm test`, `npm run lint`, and `npm run build`.
2. Confirm metadata, JWKS, DCR, PKCE exchange, refresh rotation, and revocation
   against the production-like deployment.
3. Connect Cursor or MCP Inspector and call `get_workspace_profile`.
4. Verify a second workspace cannot be queried using the first workspace's
   token.
5. Confirm Sentry errors and PostHog/OAuth audit events contain no token or raw
   enrichment values.
6. Confirm DCR remains enabled only while public external-client connections
   are supported.

## Deliberate exclusions

The MCP surface does not expose Stripe/billing, team administration, account
deletion, raw file uploads, or destructive bulk actions. Raw
`ApplicationEnrichment` rows and Hunter person payloads are not tools; contact
resolution returns a field allowlist with provenance.
