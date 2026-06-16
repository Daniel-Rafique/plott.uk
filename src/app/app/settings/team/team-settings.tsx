"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Users, AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Member = {
  id: string;
  role: string;
  userId: string;
  email: string | null;
  name: string | null;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

type SeatUsage = {
  current: number;
  limit: number;
  overage: number;
  overageAllowed: boolean;
  overagePriceLabel: string | null;
  planName: string;
};

export function TeamSettings({
  currentUserId,
  currentRole,
  members,
  invites,
  seatUsage,
}: {
  currentUserId: string;
  currentRole: string;
  members: Member[];
  invites: Invite[];
  seatUsage: SeatUsage;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [pending, startTransition] = useTransition();
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [removeMemberLoading, setRemoveMemberLoading] = useState(false);
  const canManage = currentRole === "owner" || currentRole === "admin";

  const memberToRemove = removeMemberId
    ? members.find((m) => m.id === removeMemberId)
    : null;

  const atLimit = seatUsage.current >= seatUsage.limit;
  const canInvite = canManage && (!atLimit || seatUsage.overageAllowed);

  function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    startTransition(async () => {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Invite sent");
        setEmail("");
        location.reload();
      } else if (data.upgrade) {
        toast.error(data.error ?? "Seat limit reached", {
          action: {
            label: "Upgrade",
            onClick: () => (window.location.href = "/pricing"),
          },
        });
      } else {
        toast.error(data.error ?? "Invite failed");
      }
    });
  }

  async function executeRemoveMember() {
    if (!removeMemberId) return;
    setRemoveMemberLoading(true);
    try {
      const res = await fetch(`/api/team/members/${removeMemberId}`, {
        method: "DELETE",
      });
      if (res.ok) location.reload();
      else toast.error("Could not remove member");
    } finally {
      setRemoveMemberLoading(false);
    }
  }

  async function revokeInvite(id: string) {
    const res = await fetch(`/api/team/invites/${id}`, { method: "DELETE" });
    if (res.ok) location.reload();
  }

  async function resendInvite(id: string) {
    const res = await fetch(`/api/team/invites/${id}`, { method: "POST" });
    if (res.ok) {
      toast.success("Invite resent");
    } else {
      const data = await res.json();
      toast.error(data.error ?? "Failed to resend invite");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 px-6 py-12">
      <ConfirmDialog
        open={removeMemberId !== null}
        onOpenChange={(open) => {
          if (!open && !removeMemberLoading) setRemoveMemberId(null);
        }}
        title="Remove this member?"
        description={
          memberToRemove ? (
            <p>
              <span className="font-medium text-zinc-800">
                {memberToRemove.name ?? memberToRemove.email ?? "This user"}
              </span>{" "}
              will lose access to this workspace. This does not delete their
              Plott account.
            </p>
          ) : (
            "This member will lose access to the workspace."
          )
        }
        confirmLabel="Remove"
        variant="destructive"
        isLoading={removeMemberLoading}
        onConfirm={executeRemoveMember}
      />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Invite teammates to share leads, letter templates and saved searches.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5">
          <Users className="h-4 w-4 text-zinc-500" />
          <span className="text-sm font-medium text-zinc-700">
            {seatUsage.current} / {seatUsage.limit} seats
          </span>
          <span className="text-xs text-zinc-500">({seatUsage.planName})</span>
        </div>
      </header>

      {seatUsage.overage > 0 && seatUsage.overageAllowed && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">
              {seatUsage.overage} extra seat{seatUsage.overage !== 1 ? "s" : ""} in use
            </p>
            <p className="mt-0.5 text-amber-700">
              Your plan includes {seatUsage.limit} seats. Additional seats are billed at{" "}
              {seatUsage.overagePriceLabel}/month each.
            </p>
          </div>
        </div>
      )}

      {atLimit && !seatUsage.overageAllowed && canManage && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <Users className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-blue-900">Seat limit reached</p>
            <p className="mt-0.5 text-blue-700">
              Your {seatUsage.planName} plan includes {seatUsage.limit} seat{seatUsage.limit !== 1 ? "s" : ""}.
              Upgrade to invite more team members.
            </p>
            <Link
              href="/pricing"
              className="mt-2 inline-block rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              View plans
            </Link>
          </div>
        </div>
      )}

      {canManage && (
        <form
          onSubmit={invite}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4"
        >
          <label className="flex-1 min-w-[240px]">
            <span className="block text-xs font-medium text-zinc-500">
              Email address
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@yourcompany.co.uk"
              disabled={!canInvite}
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            />
          </label>
          <label>
            <span className="block text-xs font-medium text-zinc-500">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
              disabled={!canInvite}
              className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-zinc-100"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button
            disabled={pending || !canInvite}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send invite"}
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Members
        </h2>
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium text-zinc-900">
                  {m.name ?? m.email ?? "(unnamed)"}
                  {m.userId === currentUserId && (
                    <span className="ml-2 text-xs text-zinc-500">(you)</span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">{m.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-600">
                  {m.role}
                </span>
                {canManage && m.userId !== currentUserId && (
                  <button
                    onClick={() => setRemoveMemberId(m.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {invites.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
            Pending invites
          </h2>
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
            {invites.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <div className="text-sm text-zinc-900">{i.email}</div>
                  <div className="text-xs text-zinc-500">
                    Expires {new Date(i.expiresAt).toLocaleDateString()} · {i.role}
                  </div>
                </div>
                {canManage && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => resendInvite(i.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Resend
                    </button>
                    <button
                      onClick={() => revokeInvite(i.id)}
                      className="text-xs text-zinc-600 hover:underline"
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
