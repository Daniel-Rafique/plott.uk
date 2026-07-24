"use client";

import {
  type FormEvent,
  type ReactNode,
  useState,
} from "react";

type OAuthRedirectResponse = {
  redirect_to?: string;
  error?: string;
  error_description?: string;
};

export function AuthorizationForm({ children }: { children: ReactNode }) {
  const [pendingDecision, setPendingDecision] = useState<
    "approve" | "deny" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const decision = submitter?.value === "deny" ? "deny" : "approve";
    const formData = new FormData(form);
    formData.set("decision", decision);

    setPendingDecision(decision);
    setError(null);
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const result = (await response.json()) as OAuthRedirectResponse;
      if (!response.ok || !result.redirect_to) {
        throw new Error(
          result.error_description ??
            result.error ??
            "Authorization could not be completed.",
        );
      }
      window.location.assign(result.redirect_to);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Authorization could not be completed.",
      );
      setPendingDecision(null);
    }
  }

  return (
    <form
      action="/api/oauth/authorize"
      method="post"
      className="mt-6"
      onSubmit={submit}
    >
      {children}
      {error && (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-6 flex gap-3" aria-live="polite">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pendingDecision !== null}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {pendingDecision === "approve" && (
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          {pendingDecision === "approve" ? "Authorizing…" : "Authorize"}
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          disabled={pendingDecision !== null}
          className="cursor-pointer rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {pendingDecision === "deny" ? "Denying…" : "Deny"}
        </button>
      </div>
    </form>
  );
}
