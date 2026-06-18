"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";

type Initial = {
  userEmail: string;
  emailPdfOnPrint: boolean;
  autoEmailPdf: boolean;
  pdfEmailRecipients: string[];
  prospectEmailOutreachEnabled: boolean;
};

export function NotificationsSettings({
  isAdmin,
  initial,
}: {
  isAdmin: boolean;
  initial: Initial;
}) {
  const [emailPdfOnPrint, setEmailPdfOnPrint] = useState(
    initial.emailPdfOnPrint,
  );
  const [autoEmailPdf, setAutoEmailPdf] = useState(initial.autoEmailPdf);
  const [prospectEmailOutreachEnabled, setProspectEmailOutreachEnabled] =
    useState(initial.prospectEmailOutreachEnabled);
  const [recipients, setRecipients] = useState<string[]>(
    initial.pdfEmailRecipients,
  );
  const [newRecipient, setNewRecipient] = useState("");
  const [savingUser, startSaveUser] = useTransition();
  const [savingCompany, startSaveCompany] = useTransition();

  function saveUserPrefs(e: React.FormEvent) {
    e.preventDefault();
    startSaveUser(async () => {
      const res = await fetch("/api/user/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emailPdfOnPrint }),
      });
      if (res.ok) toast.success("Preferences saved");
      else toast.error("Could not save");
    });
  }

  function saveCompanyPrefs(e: React.FormEvent) {
    e.preventDefault();
    if (autoEmailPdf && recipients.length === 0) {
      toast.error(
        "Add at least one shared recipient, or turn off workspace PDF delivery.",
      );
      return;
    }
    startSaveCompany(async () => {
      const res = await fetch("/api/company/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          autoEmailPdf,
          pdfEmailRecipients: recipients,
          prospectEmailOutreachEnabled,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          typeof data.error === "string" ? data.error : "Could not save",
        );
        return;
      }
      toast.success("Workspace preferences saved");
    });
  }

  function addRecipient() {
    const email = newRecipient.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email");
      return;
    }
    if (recipients.includes(email)) {
      toast.error("Already added");
      return;
    }
    setRecipients((prev) => [...prev, email]);
    setNewRecipient("");
  }

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((e) => e !== email));
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Control when Plott emails letter PDFs to you and shared workspace inboxes — useful for Gmail / Outlook print rules.
        </p>
      </header>

      <form
        onSubmit={saveUserPrefs}
        className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Your preferences
        </h2>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
            checked={emailPdfOnPrint}
            onChange={(e) => setEmailPdfOnPrint(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-zinc-900">
              Email me a PDF when my letter is ready to post (approved or marked sent)
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Sent once per letter to {initial.userEmail || "your account email"} when an outreach approval is confirmed or when you move a draft to&nbsp;&quot;sent&quot; (or&nbsp;&quot;printed&quot;) in Letters.
            </span>
          </span>
        </label>
        <div className="flex justify-end">
          <button
            disabled={savingUser}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {savingUser ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </form>

      <form
        onSubmit={saveCompanyPrefs}
        className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Workspace delivery
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Admins can copy PDFs to shared inboxes (e.g. an office assistant
              who handles all printing).
            </p>
          </div>
          {!isAdmin ? (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Admin only
            </span>
          ) : null}
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:opacity-60"
            checked={autoEmailPdf}
            onChange={(e) => setAutoEmailPdf(e.target.checked)}
            disabled={!isAdmin}
          />
          <span>
            <span className="block text-sm font-medium text-zinc-900">
              Email letter PDFs to shared recipients
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Applies to letters in this workspace when someone approves outreach, marks a draft as&nbsp;&quot;sent&quot;, or sets status to&nbsp;&quot;printed&quot; — independently of whether they opted in personally. Requires at least one recipient below when enabled.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 disabled:opacity-60"
            checked={prospectEmailOutreachEnabled}
            onChange={(e) => setProspectEmailOutreachEnabled(e.target.checked)}
            disabled={!isAdmin}
          />
          <span>
            <span className="block text-sm font-medium text-zinc-900">
              Allow approved outreach emails to prospects
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
              When enabled, reviewers can send an approved outreach draft by
              email if Plott found a business email address. Every send still
              requires manual approval, an email compliance check, and the
              workspace suppression list is respected.
            </span>
          </span>
        </label>
        {isAdmin && autoEmailPdf && recipients.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Add at least one email address below, or workspace PDF delivery will not send anywhere.
          </p>
        ) : null}

        <div>
          <span className="mb-2 block text-xs font-medium text-zinc-600">
            Recipients
          </span>
          <div className="mb-3 flex flex-wrap gap-2">
            {recipients.length === 0 ? (
              <span className="text-xs text-zinc-500">
                No recipients yet.
              </span>
            ) : (
              recipients.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 py-1 pl-3 pr-1 text-xs text-zinc-700"
                >
                  {email}
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => removeRecipient(email)}
                      className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                      aria-label={`Remove ${email}`}
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  ) : null}
                </span>
              ))
            )}
          </div>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={newRecipient}
                onChange={(e) => setNewRecipient(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRecipient();
                  }
                }}
                placeholder="assistant@company.com"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-300"
              />
              <button
                type="button"
                onClick={addRecipient}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add
              </button>
            </div>
          ) : null}
        </div>

        {isAdmin ? (
          <div className="flex justify-end">
            <button
              disabled={savingCompany}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {savingCompany ? "Saving…" : "Save workspace settings"}
            </button>
          </div>
        ) : null}
      </form>

      <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-6">
        <h3 className="text-sm font-semibold text-zinc-900">
          About auto-printing
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Browsers can&apos;t print silently to a local printer for security
          reasons, so Plott delivers letters as PDFs straight to your inbox.
          Pair this with a Gmail / Outlook print rule, or use your printer
          app&apos;s auto-print folder (e.g. <em>Print anywhere</em> on HP, the
          Canon Print app, or Windows <em>Printers &amp; scanners</em>) to
          print incoming PDFs automatically.
        </p>
      </div>
    </div>
  );
}
