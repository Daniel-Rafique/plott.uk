"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import posthog from "posthog-js";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import {
  fieldErrorsFromZod,
  inputErrorClass,
  signInSchema,
  type FieldErrors,
} from "@/lib/auth/form-validation";
import { cn } from "@/lib/utils";

/**
 * Neon Auth / better-auth vary the shape they return on unverified-email
 * sign-in attempts. Rather than depending on an exact message string (which
 * has already broken at least once), check code/status first and fall back to
 * a liberal regex that matches any reasonable phrasing.
 */
const UNVERIFIED_MESSAGE_PATTERNS = [
  /not\s+verified/i,
  /unverified/i,
  /verify\s+your?\s+email/i,
  /email\s+verification\s+(?:required|needed|pending)/i,
  /confirm\s+your?\s+email/i,
];

const UNVERIFIED_CODES = new Set([
  "EMAIL_NOT_VERIFIED",
  "email_not_verified",
  "EMAIL_VERIFICATION_REQUIRED",
  "email_verification_required",
  "UNVERIFIED_EMAIL",
  "unverified_email",
]);

function isEmailNotVerifiedError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "string") {
    return UNVERIFIED_MESSAGE_PATTERNS.some((re) => re.test(err));
  }
  if (typeof err !== "object") return false;
  const e = err as {
    code?: string;
    status?: string | number;
    statusCode?: number;
    message?: string;
  };
  if (e.code && UNVERIFIED_CODES.has(e.code)) return true;
  if (typeof e.status === "string" && UNVERIFIED_CODES.has(e.status)) {
    return true;
  }
  const message = typeof e.message === "string" ? e.message : "";
  return UNVERIFIED_MESSAGE_PATTERNS.some((re) => re.test(message));
}

export type SignInFormProps = {
  next?: string | null;
  defaultEmail?: string | null;
  embedded?: boolean;
  onSuccess?: (payload: { email: string }) => void;
  onNeedsVerify?: (payload: { email: string }) => void;
};

type SignInFields = "email" | "password";

function googleCallbackUrl(next: string | null | undefined): string {
  const safe = sanitizeNext(next);
  if (safe?.startsWith("/subscribe")) {
    return `/continue?next=${encodeURIComponent(safe)}`;
  }
  return safe ?? "/continue";
}

function clearFieldError(
  setFieldErrors: React.Dispatch<
    React.SetStateAction<FieldErrors<SignInFields>>
  >,
  key: SignInFields,
) {
  setFieldErrors((prev) => {
    if (!prev[key]) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });
}

export function SignInForm({
  next,
  defaultEmail,
  embedded = false,
  onSuccess,
  onNeedsVerify,
}: SignInFormProps) {
  const router = useRouter();
  const postSignInTarget = sanitizeNext(next) ?? "/continue";
  const googleTarget = googleCallbackUrl(next);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignInFields>>({});
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifyPending, setVerifyPending] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [googlePending, setGooglePending] = useState(false);

  function finishSignedIn(email: string) {
    if (embedded && onSuccess) {
      onSuccess({ email });
      return;
    }
    router.push(postSignInTarget);
    router.refresh();
  }

  async function signInWithGoogle() {
    setError(null);
    setFieldErrors({});
    setInfo(null);
    setGooglePending(true);
    try {
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: new URL(googleTarget, window.location.origin).toString(),
      });
      if (res.error) {
        setError(res.error.message ?? "Google sign-in failed. Try again.");
        setGooglePending(false);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Google sign-in failed. Try again.",
      );
      setGooglePending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setInfo(null);
    setUnverifiedEmail(null);
    setShowOtpInput(false);
    setOtpCode("");

    const form = e.currentTarget;
    const parsed = signInSchema.safeParse({
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      password: (form.elements.namedItem("password") as HTMLInputElement).value,
    });
    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZod<SignInFields>(parsed.error));
      return;
    }

    const { email, password } = parsed.data;
    setPending(true);

    try {
      const res = await authClient.signIn.email({
        email,
        password,
      });

      if (res.error) {
        const msg = res.error.message ?? "Failed to sign in. Try again.";
        setError(msg);
        if (isEmailNotVerifiedError(res.error)) {
          setUnverifiedEmail(email);
          setSavedPassword(password);
          setPending(false);
          if (embedded && onNeedsVerify) {
            onNeedsVerify({ email });
            return;
          }
          void sendVerificationCodeAuto(email);
        } else {
          setPending(false);
        }
        return;
      }

      posthog.identify(email, { email });
      posthog.capture("sign_in", { email });

      finishSignedIn(email);
      return;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to sign in. Try again.";
      setError(msg);
      if (isEmailNotVerifiedError(err)) {
        setUnverifiedEmail(email);
        setSavedPassword(password);
        setPending(false);
        if (embedded && onNeedsVerify) {
          onNeedsVerify({ email });
          return;
        }
        void sendVerificationCodeAuto(email);
      } else {
        setPending(false);
      }
    }
  }

  async function sendVerificationCodeAuto(email: string) {
    setShowOtpInput(true);
    setResendPending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (res.error) {
        setError(res.error.message ?? "Could not send verification email.");
        setShowOtpInput(false);
        setResendPending(false);
        return;
      }
      setInfo("We sent a 6-digit code to your email.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send verification email.",
      );
      setShowOtpInput(false);
    } finally {
      setResendPending(false);
    }
  }

  async function resendCode() {
    if (!unverifiedEmail) return;
    await sendVerificationCodeAuto(unverifiedEmail);
  }

  async function verifyAndSignIn() {
    if (!unverifiedEmail || !otpCode || otpCode.length !== 6) {
      setError("Please enter the 6-digit code.");
      return;
    }
    setVerifyPending(true);
    setError(null);
    setInfo(null);
    try {
      const verifyRes = await authClient.emailOtp.verifyEmail({
        email: unverifiedEmail,
        otp: otpCode,
      });
      if (verifyRes.error) {
        setError(verifyRes.error.message ?? "Invalid or expired code.");
        setVerifyPending(false);
        return;
      }

      if (!savedPassword) {
        setInfo("Email verified! Please sign in again.");
        setUnverifiedEmail(null);
        setShowOtpInput(false);
        setOtpCode("");
        setVerifyPending(false);
        return;
      }

      const signInRes = await authClient.signIn.email({
        email: unverifiedEmail,
        password: savedPassword,
      });
      if (signInRes.error) {
        setError(signInRes.error.message ?? "Sign in failed after verification.");
        setVerifyPending(false);
        return;
      }

      posthog.identify(unverifiedEmail, { email: unverifiedEmail });
      posthog.capture("sign_in", { email: unverifiedEmail, verified_inline: true });

      finishSignedIn(unverifiedEmail);
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
      setVerifyPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-4"
    >
      <button
        type="button"
        disabled={googlePending || pending}
        onClick={() => void signInWithGoogle()}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60"
      >
        <span className="text-base font-bold text-blue-600">G</span>
        {googlePending ? "Opening Google..." : "Continue with Google"}
      </button>
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        <span>or</span>
        <span className="h-px flex-1 bg-zinc-200" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaultEmail ?? undefined}
          readOnly={!!defaultEmail}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "signin-email-error" : undefined}
          onChange={() => clearFieldError(setFieldErrors, "email")}
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            defaultEmail ? "bg-zinc-50 text-zinc-600" : "bg-white",
            inputErrorClass(Boolean(fieldErrors.email)),
          )}
        />
        {fieldErrors.email ? (
          <p id="signin-email-error" className="text-sm text-red-600" role="alert">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={
            fieldErrors.password ? "signin-password-error" : undefined
          }
          onChange={() => clearFieldError(setFieldErrors, "password")}
          className={cn(
            "rounded-lg border bg-white px-3 py-2 text-sm",
            inputErrorClass(Boolean(fieldErrors.password)),
          )}
        />
        {fieldErrors.password ? (
          <p
            id="signin-password-error"
            className="text-sm text-red-600"
            role="alert"
          >
            {fieldErrors.password}
          </p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {info ? <p className="text-sm text-emerald-700">{info}</p> : null}
      {showOtpInput ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="font-medium text-emerald-900">Enter verification code</p>
          <p className="mt-1 text-emerald-800/90">
            We sent a 6-digit code to <strong>{unverifiedEmail}</strong>
          </p>
          <div className="mt-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] placeholder:tracking-[0.3em] placeholder:text-emerald-300"
              autoFocus
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => void resendCode()}
              disabled={resendPending}
              className="text-sm text-emerald-700 underline underline-offset-2 disabled:opacity-60"
            >
              {resendPending ? "Sending…" : "Resend code"}
            </button>
            <button
              type="button"
              onClick={() => void verifyAndSignIn()}
              disabled={verifyPending || otpCode.length !== 6}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {verifyPending ? "Verifying…" : "Verify & sign in"}
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
