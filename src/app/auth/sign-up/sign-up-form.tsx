"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import posthog from "posthog-js";

type ErrorState = { message: string; showSignIn?: boolean } | null;

export function SignUpForm({
  next,
  defaultEmail,
}: {
  next?: string | null;
  defaultEmail?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<ErrorState>(null);
  const [pending, setPending] = useState(false);
  const signInParams = new URLSearchParams();
  if (next) signInParams.set("next", next);
  if (defaultEmail) signInParams.set("email", defaultEmail);
  const signInHref =
    signInParams.size > 0
      ? `/auth/sign-in?${signInParams.toString()}`
      : "/auth/sign-in";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement)
      .value;

    const trimmedEmail = email.trim();

    try {
      const res = await authClient.signUp.email({
        email: trimmedEmail,
        name: name.trim() || "User",
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

      posthog.identify(trimmedEmail, { email: trimmedEmail, name: name.trim() || "User" });
      posthog.capture("sign_up", { email: trimmedEmail, name: name.trim() || "User" });

      // Neon Auth dispatches send.otp on signup when "Require email verification"
      // is enabled in the Neon Console, which our webhook turns into a branded
      // Resend email. Route the user to the code-entry page — do NOT trigger a
      // second send here (duplicate emails + mismatched callback URLs).
      const verifyUrl = new URL(
        "/auth/verify-email",
        window.location.origin,
      );
      verifyUrl.searchParams.set("email", trimmedEmail);
      if (next && next.startsWith("/")) {
        verifyUrl.searchParams.set("next", next);
      }
      router.push(verifyUrl.pathname + verifyUrl.search);
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create account.";
      const isExists =
        msg.toLowerCase().includes("already exists") ||
        msg.toLowerCase().includes("user exists");
      setError({ message: msg, showSignIn: isExists });
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
      </div>
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
          defaultValue={defaultEmail ?? undefined}
          readOnly={!!defaultEmail}
          className={`rounded-lg border border-zinc-300 px-3 py-2 text-sm ${
            defaultEmail ? "bg-zinc-50 text-zinc-600" : "bg-white"
          }`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
        />
      </div>
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p>{error.message}</p>
          {error.showSignIn ? (
            <p className="mt-1">
              <Link
                href={signInHref}
                className="font-medium underline underline-offset-2"
              >
                Sign in instead
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
