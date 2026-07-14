"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import posthog from "posthog-js";
import { sanitizeNext } from "@/lib/auth/sanitize-next";

const RESEND_COOLDOWN_S = 30;

export type VerifyEmailFieldsProps = {
  email?: string | null;
  next?: string | null;
  justCreated?: boolean;
  embedded?: boolean;
  onSuccess?: () => void;
};

export function VerifyEmailFields({
  email: emailProp = "",
  next: nextProp = null,
  justCreated = false,
  embedded = false,
  onSuccess,
}: VerifyEmailFieldsProps) {
  const router = useRouter();
  const nextTarget = sanitizeNext(nextProp);
  const initialEmail = (emailProp ?? "").trim();

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const initialOtpSentRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = initialEmail.trim();
    if (!justCreated || !trimmed || initialOtpSentRef.current) return;
    initialOtpSentRef.current = true;

    void (async () => {
      const res = await authClient.emailOtp.sendVerificationOtp({
        email: trimmed,
        type: "email-verification",
      });
      if (res.error) {
        setError(res.error.message ?? "Couldn't send verification email.");
        initialOtpSentRef.current = false;
        return;
      }
      setCooldown(RESEND_COOLDOWN_S);
      setNotice("We sent a 6-digit code to your email.");
    })();
  }, [initialEmail, justCreated]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();
    if (!trimmedEmail || trimmedCode.length < 4) {
      setError("Enter the email and the 6-digit code we sent you.");
      return;
    }
    setPending(true);
    const res = await authClient.emailOtp.verifyEmail({
      email: trimmedEmail,
      otp: trimmedCode,
    });
    if (res.error) {
      setError(res.error.message ?? "That code didn't work. Try again.");
      setPending(false);
      return;
    }

    posthog.capture("email_verified", { email: trimmedEmail });

    if (embedded && onSuccess) {
      onSuccess();
      return;
    }

    const target = nextTarget ?? "/onboarding";
    router.push(target);
    router.refresh();
  }

  async function handleResend() {
    if (cooldown > 0 || !email.trim()) return;
    setError(null);
    setNotice(null);
    const res = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim(),
      type: "email-verification",
    });
    if (res.error) {
      setError(res.error.message ?? "Couldn't send a new code. Try again.");
      return;
    }
    setCooldown(RESEND_COOLDOWN_S);
    setNotice("Fresh code sent. Check your inbox.");
  }

  return (
    <form
      onSubmit={(e) => void handleVerify(e)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="code" className="text-sm font-medium">
          Verification code
        </label>
        <input
          id="code"
          ref={inputRef}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={8}
          pattern="[0-9]*"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-3 text-center font-mono text-xl tracking-[0.3em]"
          placeholder="••••••"
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Verifying…" : "Verify email"}
      </button>
      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={cooldown > 0 || !email.trim()}
        className="text-sm font-medium text-blue-600 underline underline-offset-2 disabled:text-zinc-400 disabled:no-underline"
      >
        {cooldown > 0
          ? `Resend code in ${cooldown}s`
          : "Resend verification code"}
      </button>
    </form>
  );
}

/** Full-page verify form — reads email/next from the URL. */
export function VerifyEmailForm() {
  const search = useSearchParams();
  return (
    <VerifyEmailFields
      email={search.get("email") ?? ""}
      next={search.get("next")}
      justCreated={search.get("created") === "1"}
    />
  );
}
