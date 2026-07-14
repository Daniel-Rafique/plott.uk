"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import posthog from "posthog-js";
import { trialChargeCopy } from "@/lib/trial";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import {
  fieldErrorsFromZod,
  inputErrorClass,
  signUpSchema,
  type FieldErrors,
} from "@/lib/auth/form-validation";
import { cn } from "@/lib/utils";

type ErrorState = { message: string; showSignIn?: boolean } | null;
type SignUpFields = "name" | "email" | "password";

export type SignUpFormProps = {
  next?: string | null;
  defaultEmail?: string | null;
  /** When set, skip page navigation and report success to the funnel modal. */
  embedded?: boolean;
  onSuccess?: (payload: { email: string }) => void;
  onSwitchMode?: (mode: "sign-in") => void;
};

function googleCallbackUrl(next: string | null | undefined): string {
  const safe = sanitizeNext(next);
  if (safe?.startsWith("/subscribe")) {
    return `/onboarding?next=${encodeURIComponent(safe)}`;
  }
  return safe ?? "/onboarding";
}

export function SignUpForm({
  next,
  defaultEmail,
  embedded = false,
  onSuccess,
  onSwitchMode,
}: SignUpFormProps) {
  const router = useRouter();
  const [error, setError] = useState<ErrorState>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignUpFields>>({});
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const signupStartedRef = useRef(false);

  function captureSignupStarted(source: "google" | "form") {
    if (signupStartedRef.current) return;
    signupStartedRef.current = true;
    posthog.capture("auth_signup_started", { source });
  }
  const signInParams = new URLSearchParams();
  if (next) signInParams.set("next", next);
  if (defaultEmail) signInParams.set("email", defaultEmail);
  const signInHref =
    signInParams.size > 0
      ? `/auth/sign-in?${signInParams.toString()}`
      : "/auth/sign-in";
  const googleTarget = googleCallbackUrl(next);

  async function signUpWithGoogle() {
    setError(null);
    setFieldErrors({});
    captureSignupStarted("google");
    setGooglePending(true);
    try {
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: googleTarget,
      });
      if (res.error) {
        setError({
          message: res.error.message ?? "Google sign-up failed. Try again.",
        });
        setGooglePending(false);
      }
    } catch (err) {
      setError({
        message:
          err instanceof Error
            ? err.message
            : "Google sign-up failed. Try again.",
      });
      setGooglePending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    captureSignupStarted("form");
    posthog.capture("auth_signup_cta_clicked");

    const form = e.currentTarget;
    const parsed = signUpSchema.safeParse({
      name: (form.elements.namedItem("name") as HTMLInputElement).value,
      email: (form.elements.namedItem("email") as HTMLInputElement).value,
      password: (form.elements.namedItem("password") as HTMLInputElement).value,
    });

    if (!parsed.success) {
      setFieldErrors(fieldErrorsFromZod<SignUpFields>(parsed.error));
      return;
    }

    const { name, email: trimmedEmail, password } = parsed.data;
    setPending(true);

    try {
      const res = await authClient.signUp.email({
        email: trimmedEmail,
        name: name || "User",
        password,
      });

      if (res.error) {
        const msg = res.error.message ?? "Failed to create account.";
        const isExists =
          msg.toLowerCase().includes("already exists") ||
          msg.toLowerCase().includes("user exists");
        setError({ message: msg, showSignIn: isExists });
        setPending(false);
        return;
      }

      posthog.identify(trimmedEmail, { email: trimmedEmail, name: name || "User" });
      posthog.capture("sign_up", { email: trimmedEmail, name: name || "User" });

      if (embedded && onSuccess) {
        setPending(false);
        onSuccess({ email: trimmedEmail });
        return;
      }

      // Neon Auth dispatches send.otp on signup when "Require email verification"
      // is enabled (Verification codes mode). Route to the verify page — do NOT
      // trigger a second send in the sign-up form (verify page auto-sends once).
      const verifyUrl = new URL(
        "/auth/verify-email",
        window.location.origin,
      );
      verifyUrl.searchParams.set("email", trimmedEmail);
      verifyUrl.searchParams.set("created", "1");
      if (next && next.startsWith("/")) {
        verifyUrl.searchParams.set("next", next);
      }
      router.push(verifyUrl.pathname + verifyUrl.search);
      return;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create account.";
      const isExists =
        msg.toLowerCase().includes("already exists") ||
        msg.toLowerCase().includes("user exists");
      setError({ message: msg, showSignIn: isExists });
      setPending(false);
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
        onClick={() => void signUpWithGoogle()}
        className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-60"
      >
        <span className="text-base font-bold text-blue-600">G</span>
        {googlePending ? "Opening Google..." : "Continue with Google"}
      </button>
      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        <span>or create with email</span>
        <span className="h-px flex-1 bg-zinc-200" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
          onFocus={() => captureSignupStarted("form")}
          onChange={() =>
            setFieldErrors((prev) => {
              if (!prev.name) return prev;
              const nextErr = { ...prev };
              delete nextErr.name;
              return nextErr;
            })
          }
          className={cn(
            "rounded-lg border bg-white px-3 py-2 text-sm",
            inputErrorClass(Boolean(fieldErrors.name)),
          )}
        />
        {fieldErrors.name ? (
          <p id="name-error" className="text-sm text-red-600" role="alert">
            {fieldErrors.name}
          </p>
        ) : null}
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
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          onChange={() =>
            setFieldErrors((prev) => {
              if (!prev.email) return prev;
              const nextErr = { ...prev };
              delete nextErr.email;
              return nextErr;
            })
          }
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            defaultEmail ? "bg-zinc-50 text-zinc-600" : "bg-white",
            inputErrorClass(Boolean(fieldErrors.email)),
          )}
        />
        {fieldErrors.email ? (
          <p id="email-error" className="text-sm text-red-600" role="alert">
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
          autoComplete="new-password"
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          onChange={() =>
            setFieldErrors((prev) => {
              if (!prev.password) return prev;
              const nextErr = { ...prev };
              delete nextErr.password;
              return nextErr;
            })
          }
          className={cn(
            "rounded-lg border bg-white px-3 py-2 text-sm",
            inputErrorClass(Boolean(fieldErrors.password)),
          )}
        />
        {fieldErrors.password ? (
          <p id="password-error" className="text-sm text-red-600" role="alert">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error.message}</p>
          {error.showSignIn ? (
            <p className="mt-1">
              {onSwitchMode ? (
                <button
                  type="button"
                  onClick={() => onSwitchMode("sign-in")}
                  className="font-medium underline underline-offset-2"
                >
                  Sign in instead
                </button>
              ) : (
                <Link
                  href={signInHref}
                  className="font-medium underline underline-offset-2"
                >
                  Sign in instead
                </Link>
              )}
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Start my free trial"}
        {!pending ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
      </button>
      <p className="text-center text-xs leading-relaxed text-zinc-500">
        {trialChargeCopy()}
      </p>
    </form>
  );
}
