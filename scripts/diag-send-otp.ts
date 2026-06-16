/**
 * One-off diagnostic: sends a fake verification OTP via the same code path
 * Neon Auth would trigger. Confirms whether Resend + EMAIL_FROM are healthy.
 *
 *   npx tsx scripts/diag-send-otp.ts d.rafique@icloud.com 123456
 */
import "dotenv/config";
import { sendVerificationEmail } from "@/lib/email";

async function main() {
  const to = process.argv[2];
  const code = process.argv[3] ?? "123456";
  if (!to) {
    console.error("Usage: npx tsx scripts/diag-send-otp.ts <email> [code]");
    process.exit(1);
  }
  console.log(
    "[diag] RESEND_API_KEY present:",
    Boolean(process.env.RESEND_API_KEY),
    "length:",
    process.env.RESEND_API_KEY?.length ?? 0,
  );
  console.log(
    "[diag] From address:",
    process.env.EMAIL_FROM ?? process.env.RESEND_FROM ?? "(fallback)",
  );
  console.log("[diag] Sending to:", to);
  try {
    await sendVerificationEmail({ to, code });
    console.log("[diag] OK — Resend accepted the request");
  } catch (err) {
    console.error("[diag] FAILED:", err);
    process.exit(2);
  }
}

main();
