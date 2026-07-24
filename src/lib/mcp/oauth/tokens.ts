import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  type KeyObject,
} from "node:crypto";
import { exportJWK, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { oauthConfig, type OAuthScope } from "@/lib/mcp/oauth/config";

export type AccessTokenClaims = JWTPayload & {
  sub: string;
  aud: string;
  client_id: string;
  company_id: string;
  role: string;
  scope: string;
  jti: string;
};

let keyPair: { privateKey: KeyObject; publicKey: KeyObject; kid: string } | null =
  null;

function signingSecret(): string {
  const value = process.env.MCP_OAUTH_SIGNING_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MCP_OAUTH_SIGNING_SECRET is required in production");
  }
  return "plott-local-mcp-oauth-signing-secret";
}

function keys() {
  if (keyPair) return keyPair;
  const seed = createHash("sha256").update(signingSecret()).digest();
  const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
  const privateKey = createPrivateKey({
    key: Buffer.concat([prefix, seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);
  const kid = createHash("sha256")
    .update(publicKey.export({ format: "der", type: "spki" }))
    .digest("base64url")
    .slice(0, 16);
  keyPair = { privateKey, publicKey, kid };
  return keyPair;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const actual = Buffer.from(hashToken(verifier));
  const expected = Buffer.from(challenge);
  return (
    actual.length === expected.length && timingSafeEqual(actual, expected)
  );
}

export async function issueAccessToken(input: {
  userId: string;
  companyId: string;
  role: string;
  clientId: string;
  scopes: OAuthScope[] | string[];
  resource?: string;
}): Promise<{ token: string; expiresIn: number; jti: string }> {
  const config = oauthConfig();
  const { privateKey, kid } = keys();
  const jti = randomToken(18);
  const token = await new SignJWT({
    client_id: input.clientId,
    company_id: input.companyId,
    role: input.role,
    scope: input.scopes.join(" "),
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "at+jwt", kid })
    .setIssuer(config.issuer)
    .setSubject(input.userId)
    .setAudience(input.resource ?? config.resource)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(privateKey);
  return { token, expiresIn: config.accessTokenTtlSeconds, jti };
}

export async function verifyAccessToken(
  token: string,
  resource = oauthConfig().resource,
): Promise<AccessTokenClaims> {
  const config = oauthConfig();
  const { payload } = await jwtVerify(token, keys().publicKey, {
    algorithms: ["EdDSA"],
    issuer: config.issuer,
    audience: resource,
    typ: "at+jwt",
  });
  if (
    typeof payload.sub !== "string" ||
    typeof payload.client_id !== "string" ||
    typeof payload.company_id !== "string" ||
    typeof payload.role !== "string" ||
    typeof payload.scope !== "string" ||
    typeof payload.jti !== "string"
  ) {
    throw new Error("Access token is missing required claims");
  }
  return payload as AccessTokenClaims;
}

export async function oauthJwks() {
  const { publicKey, kid } = keys();
  const jwk = await exportJWK(publicKey);
  return { keys: [{ ...jwk, alg: "EdDSA", use: "sig", kid }] };
}
