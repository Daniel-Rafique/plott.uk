"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Star, Mail, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/rich-text-editor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type TemplateKind = "outreach" | "appeal_pitch";

type Template = {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  isDefault: boolean;
  kind: TemplateKind;
};

const OUTREACH_MERGE_FIELDS = [
  { key: "addresseeName", label: "Applicant" },
  { key: "reference", label: "Reference" },
  { key: "siteAddress", label: "Site address" },
  { key: "description", label: "Description" },
  { key: "planningUrl", label: "Planning URL" },
  { key: "companyName", label: "Company name" },
  { key: "signerName", label: "Signer" },
  { key: "date", label: "Date" },
];

const APPEAL_MERGE_FIELDS = [
  { key: "addresseeName", label: "Applicant" },
  { key: "reference", label: "Reference" },
  { key: "siteAddress", label: "Site address" },
  { key: "description", label: "Description" },
  { key: "planningUrl", label: "Planning URL" },
  { key: "refusalReason", label: "Refusal reason" },
  { key: "appealGrounds", label: "Appeal grounds" },
  { key: "appealType", label: "Appeal type" },
  { key: "decisionDate", label: "Decision date" },
  { key: "deadlineDate", label: "Appeal deadline" },
  { key: "companyName", label: "Company name" },
  { key: "signerName", label: "Signer" },
  { key: "date", label: "Date" },
];

const OUTREACH_BLANK_BODY = `<p>Dear {{addresseeName}},</p>
<p>We write with a brief introduction regarding the proposal described below. It is summarised in the council listing as: <em>{{description}}</em>.</p>
<p>{{companyName}} works with owners and developers undertaking planning-led projects. If you are considering appointing a contractor or would welcome a conversation, we would be pleased to hear from you.</p>`;

const APPEAL_BLANK_BODY = `<p>Dear {{addresseeName}},</p>
<p>We noted the refusal decision dated <strong>{{decisionDate}}</strong>. The decision cited: <em>{{refusalReason}}</em>.</p>
<p>Having reviewed the decision notice, we believe the refusal may be open to challenge on the following grounds: {{appealGrounds}}.</p>
<p>An appeal to the Planning Inspectorate ({{appealType}}) must be submitted by <strong>{{deadlineDate}}</strong>. {{companyName}} assists applicants through the appeals process and would welcome a brief call to discuss whether an appeal is worth pursuing.</p>
<p>Kind regards,<br/>{{signerName}}</p>`;

const KIND_LABELS: Record<TemplateKind, string> = {
  outreach: "Outreach",
  appeal_pitch: "Appeal pitch",
};

const KIND_ICONS: Record<TemplateKind, typeof Mail> = {
  outreach: Mail,
  appeal_pitch: Scale,
};

const KINDS: TemplateKind[] = ["outreach", "appeal_pitch"];

function blankTemplate(kind: TemplateKind, isFirst: boolean): Template {
  return {
    id: "",
    name: kind === "appeal_pitch" ? "New appeal pitch" : "New template",
    subject:
      kind === "appeal_pitch"
        ? "Appeal options for {{reference}}"
        : "{{companyName}} — planning application {{reference}}",
    bodyHtml: kind === "appeal_pitch" ? APPEAL_BLANK_BODY : OUTREACH_BLANK_BODY,
    isDefault: isFirst,
    kind,
  };
}

export function TemplatesSettings({
  templates: initial,
}: {
  templates: Template[];
}) {
  const [templates, setTemplates] = useState(initial);
  const [kindFilter, setKindFilter] = useState<TemplateKind>("outreach");
  const [active, setActive] = useState<Template | null>(
    initial.find((t) => t.kind === "outreach") ?? initial[0] ?? null,
  );
  const [pending, startTransition] = useTransition();
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [deleteTemplateLoading, setDeleteTemplateLoading] = useState(false);

  const deleteTemplate = deleteTemplateId
    ? templates.find((t) => t.id === deleteTemplateId)
    : null;

  const visibleTemplates = useMemo(
    () => templates.filter((t) => t.kind === kindFilter),
    [templates, kindFilter],
  );

  const mergeFields =
    active?.kind === "appeal_pitch"
      ? APPEAL_MERGE_FIELDS
      : OUTREACH_MERGE_FIELDS;

  function switchKind(kind: TemplateKind) {
    setKindFilter(kind);
    const next =
      templates.find((t) => t.kind === kind && t.isDefault) ??
      templates.find((t) => t.kind === kind) ??
      null;
    setActive(next);
  }

  function newTemplate() {
    const isFirstOfKind = !templates.some((t) => t.kind === kindFilter);
    setActive(blankTemplate(kindFilter, isFirstOfKind));
  }

  async function save() {
    if (!active) return;
    startTransition(async () => {
      const res = await fetch(
        active.id ? `/api/templates/${active.id}` : `/api/templates`,
        {
          method: active.id ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(active),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success("Template saved");
      const saved = data.template as Template;
      setTemplates((prev) => {
        const existing = prev.findIndex((t) => t.id === saved.id);
        if (existing >= 0) {
          const next = [...prev];
          next[existing] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      setActive(saved);
    });
  }

  async function executeTemplateDelete() {
    if (!deleteTemplateId) return;
    setDeleteTemplateLoading(true);
    try {
      const id = deleteTemplateId;
      const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        setActive(null);
        setDeleteTemplateId(null);
        toast.success("Template deleted");
      } else {
        toast.error("Could not delete template");
      }
    } finally {
      setDeleteTemplateLoading(false);
    }
  }

  async function setDefault(id: string) {
    const res = await fetch(`/api/templates/${id}/default`, { method: "POST" });
    if (res.ok) {
      const target = templates.find((t) => t.id === id);
      const kind = target?.kind ?? "outreach";
      setTemplates((prev) =>
        prev.map((t) =>
          t.kind === kind ? { ...t, isDefault: t.id === id } : t,
        ),
      );
      toast.success("Default updated");
    }
  }

  function updateBodyHtml(html: string) {
    if (!active) return;
    setActive({ ...active, bodyHtml: html });
  }

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={deleteTemplateId !== null}
        onOpenChange={(open) => {
          if (!open && !deleteTemplateLoading) setDeleteTemplateId(null);
        }}
        title="Delete this template?"
        description={
          deleteTemplate ? (
            <p>
              <span className="font-medium text-zinc-800">
                {deleteTemplate.name}
              </span>{" "}
              will be removed. Letters that already used it are unchanged.
            </p>
          ) : (
            "This template will be removed."
          )
        }
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteTemplateLoading}
        onConfirm={executeTemplateDelete}
      />

      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((kind) => {
          const Icon = KIND_ICONS[kind];
          const count = templates.filter((t) => t.kind === kind).length;
          const isActive = kindFilter === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => switchKind(kind)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                isActive
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
              )}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {KIND_LABELS[kind]}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  isActive ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-600",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <aside>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              {KIND_LABELS[kindFilter]}
            </h2>
            <button
              type="button"
              onClick={newTemplate}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white hover:bg-zinc-800"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>
          {visibleTemplates.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-200 p-3 text-xs text-zinc-500">
              No {KIND_LABELS[kindFilter].toLowerCase()} templates yet. Create
              one to get started.
            </p>
          ) : (
            <ul className="space-y-1">
              {visibleTemplates.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setActive(t)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm",
                      active?.id === t.id
                        ? "bg-zinc-900 text-white"
                        : "hover:bg-zinc-100",
                    )}
                  >
                    <span className="truncate">{t.name}</span>
                    {t.isDefault && (
                      <Star className="h-3 w-3 text-amber-400" aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {active && (
          <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold">
                  {active.id ? "Edit template" : "New template"}
                </h1>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {KIND_LABELS[active.kind]} template
                </p>
              </div>
              <div className="flex items-center gap-2">
                {active.id && !active.isDefault && (
                  <button
                    type="button"
                    onClick={() => setDefault(active.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                  >
                    <Star className="h-3 w-3" aria-hidden />
                    Set default
                  </button>
                )}
                {active.id && (
                  <button
                    type="button"
                    onClick={() => setDeleteTemplateId(active.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Delete
                  </button>
                )}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                Template name
              </span>
              <input
                value={active.name}
                onChange={(e) => setActive({ ...active, name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-zinc-600">
                Subject
              </span>
              <input
                value={active.subject}
                onChange={(e) =>
                  setActive({ ...active, subject: e.target.value })
                }
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>

            <div>
              <span className="mb-2 block text-xs font-medium text-zinc-600">
                Letter body
              </span>
              <p className="mb-2 text-xs leading-relaxed text-zinc-500">
                The printed/PDF layout already shows planning{" "}
                <strong>reference</strong> and <strong>site address</strong> under
                the &quot;Re:&quot; line when those fields exist — you rarely need{" "}
                <code className="rounded bg-zinc-100 px-1">{`{{reference}}`}</code>{" "}
                /{" "}
                <code className="rounded bg-zinc-100 px-1">{`{{siteAddress}}`}</code>{" "}
                in the body as well unless you intentionally want fuller prose.
              </p>
              <RichTextEditor
                value={active.bodyHtml}
                onChange={updateBodyHtml}
                placeholder="Start typing your letter..."
                mergeFields={mergeFields}
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
