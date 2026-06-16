/**
 * Neon Auth webhook receiver. Configured in the Neon Console to subscribe to:
 *   - send.otp              -> branded verification code email via Resend
 *   - send.password_reset   -> branded password reset email via Resend
 *   - user.before_create    -> (currently a passthrough; hook for disposable-
 *                              domain blocking / CRM logging)
 *
 * Returning `{ handled: true }` / 200 tells Neon Auth to skip its default
 * delivery. See docs/onboarding-runbook.md for setup.
 */
import { NextResponse } from "next/server";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "@/lib/email";
import {
  verifyNeonWebhook,
  WebhookVerificationError,
} from "@/lib/auth/webhook";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NeonUser = {
  id?: string;
  email?: string;
  name?: string | null;
  emailVerified?: boolean;
};

type EventPayload = {
  event_type: string;
  event_data?: Record<string, unknown>;
  user?: NeonUser;
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  let payload: EventPayload;
  try {
    payload = (await verifyNeonWebhook(rawBody, req.headers)) as EventPayload;
  } catch (err) {
    const status = err instanceof WebhookVerificationError ? err.status : 400;
    const message = err instanceof Error ? err.message : "verify failed";
    logger.warn({ err: message, status }, "neon_auth_webhook_verify_failed");
    return NextResponse.json({ error: message }, { status });
  }

  const type = payload.event_type;
  const data = payload.event_data ?? {};
  const user = payload.user ?? {};

  try {
    switch (type) {
      case "send.otp":
      case "send.verification": {
        const email =
          asString(user.email) ?? asString(data.email) ?? null;
        const code =
          asString(data.otp_code) ??
          asString(data.code) ??
          asString(data.otp);
        if (!email || !code) {
          logger.warn({ type, hasEmail: !!email, hasCode: !!code }, "neon_auth_webhook_missing_fields");
          return NextResponse.json(
            { handled: false, error: "missing email or code" },
            { status: 400 },
          );
        }
        await sendVerificationEmail({ to: email, code });
        logger.info({ email }, "neon_auth_webhook_otp_sent");
        return NextResponse.json({ handled: true });
      }

      case "send.password_reset":
      case "send.reset_password": {
        const email =
          asString(user.email) ?? asString(data.email) ?? null;
        const resetUrl =
          asString(data.reset_url) ??
          asString(data.link_url) ??
          asString(data.url);
        if (!email || !resetUrl) {
          logger.warn({ type, hasEmail: !!email, hasUrl: !!resetUrl }, "neon_auth_webhook_missing_fields");
          return NextResponse.json(
            { handled: false, error: "missing email or reset url" },
            { status: 400 },
          );
        }
        await sendPasswordResetEmail({ to: email, resetUrl });
        logger.info({ email }, "neon_auth_webhook_password_reset_sent");
        return NextResponse.json({ handled: true });
      }

      case "send.magic_link": {
        const email =
          asString(user.email) ?? asString(data.email) ?? null;
        const linkUrl =
          asString(data.link_url) ?? asString(data.url);
        if (!email || !linkUrl) {
          return NextResponse.json(
            { handled: false, error: "missing email or link url" },
            { status: 400 },
          );
        }
        await sendPasswordResetEmail({ to: email, resetUrl: linkUrl });
        logger.info({ email }, "neon_auth_webhook_magic_link_sent");
        return NextResponse.json({ handled: true });
      }

      case "user.before_create": {
        return NextResponse.json({ allowed: true });
      }

      case "user.created": {
        logger.info(
          { email: user.email, userId: user.id },
          "neon_auth_user_created",
        );
        return NextResponse.json({ success: true });
      }

      default:
        logger.info({ type }, "neon_auth_webhook_unhandled");
        return NextResponse.json({ success: true });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, type }, "neon_auth_webhook_handler_failed");
    return NextResponse.json(
      { handled: false, error: "internal" },
      { status: 500 },
    );
  }
}
