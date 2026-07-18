"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";

type Props = {
  user: {
    email: string | null;
    name: string | null;
    twoFactorEmailEnabled: boolean;
  };
  accounts: {
    hasCredentialAccount: boolean;
    providers: string[];
  };
};

export function AccountSecuritySettings({ user, accounts }: Props) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    user.twoFactorEmailEnabled,
  );
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function updateTwoFactor(nextValue: boolean) {
    if (accounts.hasCredentialAccount && !password) {
      toast.error("Enter your current password first.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/account/security", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        twoFactorEmailEnabled: nextValue,
        password: accounts.hasCredentialAccount ? password : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaving(false);
      toast.error(data.error ?? "Could not update account security.");
      return;
    }
    setTwoFactorEnabled(nextValue);
    setPassword("");

    // Enabling requires a clean re-login so the password → email-code path
    // runs immediately (avoids a half-session that looks logged out).
    if (nextValue && data.requiresSignIn) {
      toast.success("Email 2FA is on. Sign in again to continue.");
      await fetch("/api/auth/second-factor/clear", { method: "POST" }).catch(
        () => null,
      );
      await authClient.signOut();
      const params = new URLSearchParams({ notice: "2fa-enabled" });
      if (user.email) params.set("email", user.email);
      window.location.href = `/auth/sign-in?${params.toString()}`;
      return;
    }

    setSaving(false);
    toast.success("Email 2FA has been disabled.");
  }

  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") {
      toast.error("Type DELETE to confirm.");
      return;
    }
    if (accounts.hasCredentialAccount && !deletePassword) {
      toast.error("Enter your current password.");
      return;
    }
    setDeleting(true);
    const res = await fetch("/api/account/security", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confirm: deleteConfirm,
        password: accounts.hasCredentialAccount ? deletePassword : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      toast.error(
        typeof data.error === "string" && data.error.length > 0
          ? data.error
          : "Could not delete account. Please try again or contact hi@plott.uk.",
      );
      return;
    }
    const refunded =
      typeof data.refundedAmount === "number" && data.refundedAmount > 0
        ? data.refundedAmount
        : 0;
    if (refunded > 0) {
      const currency = typeof data.currency === "string" ? data.currency : "gbp";
      const amount = (refunded / 100).toLocaleString("en-GB", {
        style: "currency",
        currency: currency.toUpperCase(),
      });
      toast.success(`Account deleted. Refund of ${amount} is on the way.`);
    } else {
      toast.success("Account deleted.");
    }
    await fetch("/api/auth/second-factor/clear", { method: "POST" }).catch(
      () => null,
    );
    await authClient.signOut();
    window.location.href = "/";
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Manage sign-in security and account deletion for{" "}
          <span className="font-medium text-zinc-900">
            {user.email ?? "your account"}
          </span>
          .
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Linked sign-in methods:{" "}
          {accounts.providers.length > 0
            ? accounts.providers.join(", ")
            : "unknown"}
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-semibold text-zinc-900">
                Email two-factor login
              </h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              When enabled, Plott sends a one-time email code after password
              sign-in before the workspace opens. Codes expire after 10 minutes.
            </p>
            {!twoFactorEnabled ? (
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                Enabling 2FA will sign you out. Sign back in with your password,
                then enter the email code to open your workspace.
              </p>
            ) : null}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              twoFactorEnabled
                ? "bg-emerald-50 text-emerald-700"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {twoFactorEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <div className="mt-5 max-w-md space-y-3">
          {accounts.hasCredentialAccount ? (
            <label className="block">
              <span className="text-xs font-medium text-zinc-500">
                Current password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="Required to change 2FA"
              />
            </label>
          ) : (
            <p className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              This account signs in with Google, so Plott will use your fresh
              authenticated session instead of asking for a password.
            </p>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => void updateTwoFactor(!twoFactorEnabled)}
            className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {twoFactorEnabled
              ? "Disable email 2FA"
              : "Enable email 2FA and sign out"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-red-600" />
          <div>
            <h2 className="text-lg font-semibold text-red-900">
              Delete account
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              This permanently removes your Plott login and, if you are the only
              member of a workspace, deletes that workspace. Any active
              subscription is canceled immediately and unused days in the
              current billing period are refunded to your payment method. Shared
              workspaces require ownership transfer before deletion.
            </p>
          </div>
        </div>

        <div className="mt-5 max-w-md space-y-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-500">
              Type DELETE to confirm
            </span>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
            />
          </label>
          {accounts.hasCredentialAccount ? (
            <label className="block">
              <span className="text-xs font-medium text-zinc-500">
                Current password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              />
            </label>
          ) : (
            <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-900">
              Google-only accounts do not have a Plott password. For safety,
              delete shortly after signing in with Google.
            </p>
          )}
          <button
            type="button"
            disabled={
              deleting ||
              deleteConfirm !== "DELETE" ||
              (accounts.hasCredentialAccount && !deletePassword)
            }
            onClick={() => void deleteAccount()}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete my account
          </button>
        </div>
      </section>
    </div>
  );
}
