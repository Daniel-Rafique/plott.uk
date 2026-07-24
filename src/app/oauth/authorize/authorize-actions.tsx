"use client";

import { useFormStatus } from "react-dom";

export function AuthorizeActions() {
  const { data, pending } = useFormStatus();
  const decision = data?.get("decision");

  return (
    <div className="mt-6 flex gap-3" aria-live="polite">
      <button
        type="submit"
        name="decision"
        value="approve"
        disabled={pending}
        className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
      >
        {pending && decision === "approve" && (
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          />
        )}
        {pending && decision === "approve" ? "Authorizing…" : "Authorize"}
      </button>
      <button
        type="submit"
        name="decision"
        value="deny"
        disabled={pending}
        className="cursor-pointer rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
      >
        {pending && decision === "deny" ? "Denying…" : "Deny"}
      </button>
    </div>
  );
}
