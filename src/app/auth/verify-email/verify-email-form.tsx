"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import posthog from "posthog-js";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import {
  fieldErrorsFromZod,
  inputErrorClass,
  verifyEmailSchema,
  type FieldErrors,
} from "@/lib/auth/form-validation";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN_S = 30;

export type VerifyEmailFieldsProps = {
  email?: string | null;
  next?: string | null;
  justCreated?: boolean;
  embedded?: boolean;
  onSuccess?: () => void;
};

type VerifyFields = "email" | "code";

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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<VerifyFields>>({});
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
    setFieldErrors({});
    setNotice(null);

    const parsed = verifyEmailSchema.safeParse({ email, code });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZod<VerifyFields>(parsed.error));
      return;
    }

    const { email: trimmedEmail, code: trimmedCode } = parsed.data;
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
      noValidate
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
          autoComplete="email"
          value={email}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "verify-email-error" : undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldErrors((prev) => {
              if (!prev.email) return prev;
              const next = { ...prev };
              delete next.email;
              return next;
            });
          }}
          className={cn(
            "rounded-lg border bg-white px-3 py-2 text-sm",
            inputErrorClass(Boolean(fieldErrors.email)),
          )}
        />
        {fieldErrors.email ? (
          <p id="verify-email-error" className="text-sm text-red-600" role="alert">
            {fieldErrors.email}
          </p>
        ) : null}
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
          maxLength={6}
          value={code}
          aria-invalid={Boolean(fieldErrors.code)}
          aria-describedby={fieldErrors.code ? "verify-code-error" : undefined}
          onChange={(e) => {
            setCode(e.target.value.replace(/[^0-9]/g, ""));
            setFieldErrors((prev) => {
              if (!prev.code) return prev;
              const next = { ...prev };
              delete next.code;
              return next;
            });
          }}
          className={cn(
            "rounded-lg border bg-white px-3 py-3 text-center font-mono text-xl tracking-[0.3em]",
            inputErrorClass(Boolean(fieldErrors.code)),
          )}
          placeholder="••••••"
        />
        {fieldErrors.code ? (
          <p id="verify-code-error" className="text-sm text-red-600" role="alert">
            {fieldErrors.code}
          </p>
        ) : null}
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
