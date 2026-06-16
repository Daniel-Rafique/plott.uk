"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setError(null);
    setPending(true);
    const res = await authClient.signOut();
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? "Could not sign out. Try again.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => void handleSignOut()}
        className="rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-60 xl:px-5 xl:py-2.5 xl:text-[11px] xl:tracking-[0.22em]"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <p className="max-w-[16rem] text-right text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
