import { prisma } from "@/lib/prisma";
import { normalizeScopes, oauthConfig } from "@/lib/mcp/oauth/config";

export type ValidAuthorizationRequest = {
  clientId: string;
  clientName: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  resource: string;
  codeChallenge: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function validateAuthorizationRequest(
  params: SearchParams,
): Promise<ValidAuthorizationRequest> {
  const clientId = one(params.client_id);
  const redirectUri = one(params.redirect_uri);
  const state = one(params.state);
  const responseType = one(params.response_type);
  const resource = one(params.resource) || oauthConfig().resource;
  const codeChallenge = one(params.code_challenge);
  const codeChallengeMethod = one(params.code_challenge_method);

  if (!clientId || !redirectUri || responseType !== "code") {
    throw new Error("Invalid authorization request");
  }
  if (!state || state.length > 512) throw new Error("A valid state is required");
  if (
    codeChallengeMethod !== "S256" ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)
  ) {
    throw new Error("S256 PKCE is required");
  }
  if (resource !== oauthConfig().resource) {
    throw new Error("Unsupported resource");
  }

  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (
    !client ||
    (client.expiresAt && client.expiresAt <= new Date()) ||
    !client.redirectUris.includes(redirectUri)
  ) {
    throw new Error("Unknown client or redirect URI");
  }
  const scopes = normalizeScopes(one(params.scope));
  if (client.scopes.length) {
    const disallowed = scopes.filter((scope) => !client.scopes.includes(scope));
    if (disallowed.length) throw new Error("Client requested unregistered scopes");
  }
  return {
    clientId,
    clientName: client.clientName,
    redirectUri,
    scopes,
    state,
    resource,
    codeChallenge,
  };
}
