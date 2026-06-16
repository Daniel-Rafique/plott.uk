/**
 * Neon Auth webhook signature verification (Ed25519 detached JWS).
 *
 * Neon Auth signs webhook payloads with an Ed25519 key and publishes the
 * public portion at `${NEON_AUTH_BASE_URL}/.well-known/jwks.json`. Each
 * request carries three headers:
 *
 *   x-neon-signature       - detached JWS: `${headerB64}..${signatureB64}`
 *   x-neon-signature-kid   - JWK `kid` used to sign
 *   x-neon-timestamp       - unix-ms; we refuse anything older than 5 minutes
 *
 * The signing input is the standard JWS double base64url encoding:
 * `${headerB64}.${base64url(`${timestamp}.${base64url(rawBody)}`)}`
 */
import crypto from "node:crypto";

export class WebhookVerificationError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "WebhookVerificationError";
    this.status = status;
  }
}

type Jwks = { keys: Array<{ kid?: string; kty: string; crv?: string; x?: string }> };

let jwksCache: { fetchedAt: number; jwks: Jwks } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000;

async function fetchJwks(): Promise<Jwks> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.jwks;
  }
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!baseUrl) throw new WebhookVerificationError("NEON_AUTH_BASE_URL not set", 500);
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/.well-known/jwks.json`);
  if (!res.ok) {
    throw new WebhookVerificationError(`JWKS fetch failed: ${res.status}`, 502);
  }
  const jwks = (await res.json()) as Jwks;
  jwksCache = { fetchedAt: Date.now(), jwks };
  return jwks;
}

export async function verifyNeonWebhook(
  rawBody: string,
  headers: Headers,
): Promise<unknown> {
  const signature = headers.get("x-neon-signature");
  const kid = headers.get("x-neon-signature-kid");
  const timestamp = headers.get("x-neon-timestamp");

  if (!signature || !kid || !timestamp) {
    throw new WebhookVerificationError(
      "Missing x-neon-signature / -kid / -timestamp headers",
    );
  }

  const jwks = await fetchJwks();
  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) {
    throw new WebhookVerificationError(`No JWK matched kid=${kid}`);
  }

  const publicKey = crypto.createPublicKey({
    key: jwk as crypto.JsonWebKey,
    format: "jwk",
  });

  const [headerB64, emptyPayload, signatureB64] = signature.split(".");
  if (emptyPayload !== "" || !headerB64 || !signatureB64) {
    throw new WebhookVerificationError("Expected detached JWS (header..sig)");
  }

  const payloadB64 = Buffer.from(rawBody, "utf8").toString("base64url");
  const signaturePayload = `${timestamp}.${payloadB64}`;
  const signaturePayloadB64 = Buffer.from(signaturePayload, "utf8").toString(
    "base64url",
  );
  const signingInput = `${headerB64}.${signaturePayloadB64}`;

  const isValid = crypto.verify(
    null,
    Buffer.from(signingInput),
    publicKey,
    Buffer.from(signatureB64, "base64url"),
  );

  if (!isValid) {
    throw new WebhookVerificationError("Invalid webhook signature");
  }

  const ageMs = Date.now() - Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000 || ageMs < -60_000) {
    throw new WebhookVerificationError("Webhook timestamp too old or skewed");
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new WebhookVerificationError("Webhook body was not valid JSON");
  }
}
