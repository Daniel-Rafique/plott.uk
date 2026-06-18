"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth/client";

const RESEND_COOLDOWN_S = 30;

export function TwoFactorForm() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sentOnMount = useRef(false);

  const sendCode = useCallback(async () => {
    if (sending || cooldown > 0) return;
    setSending(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/auth/second-factor/send", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) {
      setError(data.error ?? "Could not send a sign-in code.");
      return;
    }
    if (data.required === false) {
      window.location.href = "/app/dashboard";
      return;
    }
    setCooldown(RESEND_COOLDOWN_S);
    setNotice("We sent a 6-digit sign-in code to your email.");
  }, [cooldown, sending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (sentOnMount.current) return;
    sentOnMount.current = true;
    void sendCode();
  }, [sendCode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/auth/second-factor/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: trimmed }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.error ?? "That code did not work.");
      return;
    }
    window.location.href = "/app/dashboard";
  }

  async function signOut() {
    await fetch("/api/auth/second-factor/clear", { method: "POST" }).catch(
      () => null,
    );
    await authClient.signOut();
    window.location.href = "/auth/sign-in";
  }

  return (
    <form onSubmit={(e) => void verify(e)} className="flex flex-col gap-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        Email 2FA is enabled for this account. Enter the one-time code to
        finish signing in.
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="code" className="text-sm font-medium">
          Sign-in code
        </label>
        <input
          id="code"
          ref={inputRef}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          pattern="[0-9]*"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-3 text-center font-mono text-xl tracking-[0.3em]"
          placeholder="000000"
        />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
      <button
        type="submit"
        disabled={pending || code.length !== 6}
        className="rounded-full bg-zinc-900 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? "Verifying..." : "Verify & continue"}
      </button>
      <button
        type="button"
        onClick={() => void sendCode()}
        disabled={sending || cooldown > 0}
        className="text-sm font-medium text-blue-600 underline underline-offset-2 disabled:text-zinc-400 disabled:no-underline"
      >
        {sending
          ? "Sending..."
          : cooldown > 0
            ? `Resend code in ${cooldown}s`
            : "Resend sign-in code"}
      </button>
      <button
        type="button"
        onClick={() => void signOut()}
        className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800"
      >
        Sign in with a different account
      </button>
    </form>
  );
}
