"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  Mail,
  Search,
  Printer,
  Sparkles,
  User,
  Building,
  Scroll,
} from "lucide-react";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import { LetterAssistDrawer } from "./letter-assist-drawer";
import posthog from "posthog-js";
import {
  contactKey,
  mergeProprietor,
  type OutreachContact,
  type OutreachContactBundle,
} from "@/lib/outreach-contact";
import {
  buildOutreachContactCacheKeyFromParams,
  getOutreachContactSessionCache,
  setOutreachContactSessionCache,
} from "@/lib/outreach-contact-session-cache";
import { cn } from "@/lib/utils";
import {
  PulseIndicator,
  WaveformLoader,
} from "./ui/loading-indicators";
import { Callout } from "./ui/callout";
import { useMountReveal } from "@/lib/animation/use-mount-reveal";
import { ConfidenceTooltip } from "./confidence-tooltip";

type ProprietorApiResponse = {
  uprn?: string | null;
  titleNumber?: string | null;
  matchedAddress?: string | null;
  corporateOwner?: string | null;
  proprietorName?: string | null;
  proprietorNames?: string[];
  proprietorSource?: string;
  pending?: boolean;
  warnings?: string[];
  error?: string;
};

type Props = {
  application: PlanningApplicationEntity | null;
  isOpen: boolean;
  onClose: () => void;
  /** Optional: pre-selected contact from another surface (e.g. the applicant modal handoff). */
  initialContact?: OutreachContact | null;
};

function kindIcon(kind: OutreachContact["kind"]) {
  if (kind === "agent") return Building;
  if (kind === "applicant") return User;
  if (kind === "proprietor") return Scroll;
  return Mail;
}

function kindLabel(kind: OutreachContact["kind"]): string {
  if (kind === "agent") return "Planning agent";
  if (kind === "applicant") return "Planning applicant";
  if (kind === "proprietor") return "Registered proprietor";
  return "Manual entry";
}

function confidencePillClass(
  confidence: "low" | "medium" | "high",
): string {
  if (confidence === "high")
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (confidence === "medium") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-zinc-100 text-zinc-600 ring-zinc-200";
}

export function ProprietorLetterModal({
  application,
  isOpen,
  onClose,
  initialContact,
}: Props) {
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundle, setBundle] = useState<OutreachContactBundle | null>(null);
  const [proprietorLoading, setProprietorLoading] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const revealRef = useMountReveal<HTMLDivElement>(isOpen);
  const [proprietorData, setProprietorData] =
    useState<ProprietorApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [letterHtml, setLetterHtml] = useState<string | null>(null);
  const [letterBody, setLetterBody] = useState<string | null>(null);
  const [letterId, setLetterId] = useState<string | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);
  const [resolvedPostcode, setResolvedPostcode] = useState<string>("");
  const [previewSrcDoc, setPreviewSrcDoc] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  const currentLetterBody = letterBody ?? "";

  const previewIframeKey = useMemo(() => {
    if (!previewSrcDoc) return previewLoading ? "loading" : "empty";
    let h = 0;
    const s = previewSrcDoc;
    for (let i = 0; i < s.length; i++) {
      h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return `${s.length}-${h}`;
  }, [previewSrcDoc, previewLoading]);

  const address = application?.["address-text"]?.trim() ?? "";
  const feedPostcode = application?.postcode?.trim() ?? "";
  const point = application?.point ?? "";

  // When PlanWire doesn't supply a postcode, reverse-geocode from the
  // application's lat/lng via postcodes.io (free, no key, CORS-enabled).
  useEffect(() => {
    if (!isOpen || feedPostcode || !point) return;
    const match = point.match(/POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/);
    if (!match) return;
    const [, lng, lat] = match;
    let cancelled = false;
    fetch(
      `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.result?.[0]?.postcode) return;
        setResolvedPostcode(json.result[0].postcode);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, feedPostcode, point]);

  const postcode = feedPostcode || resolvedPostcode;

  const fullSiteAddress = useMemo(() => {
    if (!address) return "";
    if (!postcode) return address;
    return address.toLowerCase().includes(postcode.toLowerCase())
      ? address
      : `${address}, ${postcode}`;
  }, [address, postcode]);
  const reference = application?.reference?.trim() ?? "";
  const description = application?.description?.trim() ?? "";
  const planningEntity = application?.entity ?? null;
  // PlanWire returns the council-portal URL per row; empty when unavailable.
  const planningUrl = application?.sourceUrl ?? "";

  useEffect(() => {
    if (!isOpen || !application) return;
    let cancelled = false;

    async function load() {
      setError(null);
      const params = new URLSearchParams();
      if (reference) params.set("reference", reference);
      if (planningEntity != null) {
        params.set("planning_entity", String(planningEntity));
      }
      if (application?.["organisation-entity"] != null) {
        params.set(
          "organisation_entity",
          String(application["organisation-entity"]),
        );
      }
      if (address) params.set("site_address", address);
      if (application?.enrichment?.applicantName) {
        params.set("seed_applicant", application.enrichment.applicantName);
      }
      if (application?.enrichment?.agentName) {
        params.set("seed_agent", application.enrichment.agentName);
      }
      if (application?.enrichment?.agentAddress) {
        params.set("seed_agent_address", application.enrichment.agentAddress);
      }
      if (!reference || planningEntity == null) {
        return;
      }
      const cacheKey = buildOutreachContactCacheKeyFromParams(params);
      const fromSession = getOutreachContactSessionCache(cacheKey);
      if (fromSession) {
        if (cancelled) return;
        setBundle(fromSession);
        const prefer =
          (initialContact &&
            fromSession.candidates.find(
              (c) => contactKey(c) === contactKey(initialContact),
            )) ??
          fromSession.candidates[0];
        if (prefer) setSelectedKey(contactKey(prefer));
        setBundleLoading(false);
        return;
      }
      setBundleLoading(true);
      try {
        const res = await fetch(
          `/api/outreach/contact?${params.toString()}`,
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(json.error ?? "Could not resolve contact candidates");
        }
        const b = json as OutreachContactBundle;
        setOutreachContactSessionCache(cacheKey, b);
        setBundle(b);
        const prefer =
          (initialContact && b.candidates.find((c) => contactKey(c) === contactKey(initialContact))) ??
          b.candidates[0];
        if (prefer) setSelectedKey(contactKey(prefer));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setBundleLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    reference,
    planningEntity,
    application,
    address,
    initialContact,
  ]);

  useEffect(() => {
    if (!isOpen) {
      queueMicrotask(() => {
        setBundle(null);
        setProprietorData(null);
        setError(null);
        setSelectedKey(null);
        setManualName("");
        setLetterHtml(null);
        setLetterBody(null);
        setResolvedPostcode("");
        setLetterId(null);
        setPreviewSrcDoc("");
        setBundleLoading(false);
        setProprietorLoading(false);
        setPurchaseLoading(false);
        setLetterLoading(false);
        setPreviewLoading(false);
      });
    }
  }, [isOpen]);

  // Compose preview from in-memory body via POST override so AI rewrites
  // appear immediately — don't rely on GET /render which reads the DB and
  // can race the PATCH that persists an assist apply.
  useEffect(() => {
    if (!isOpen || !letterHtml || !letterId) return;
    let cancelled = false;
    queueMicrotask(() => setPreviewLoading(true));
    void fetch(`/api/letter/${letterId}/render`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bodyHtml: currentLetterBody }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Preview failed");
        const html = await res.text();
        if (!cancelled) setPreviewSrcDoc(html);
      })
      .catch(() => {
        if (!cancelled) setPreviewSrcDoc("");
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, letterHtml, letterId, currentLetterBody]);

  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  const candidates = bundle?.candidates ?? [];
  const selected = candidates.find((c) => contactKey(c) === selectedKey) ?? null;
  const selectedIsManual = selected?.kind === "manual";

  async function findProprietor(purchaseDocuments: boolean) {
    if (!address) {
      setError("No address on this application.");
      return;
    }
    posthog.capture("proprietor_lookup_started", {
      purchase_documents: purchaseDocuments,
      planning_reference: reference,
    });
    if (purchaseDocuments) setPurchaseLoading(true);
    else setProprietorLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/property/proprietor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, postcode, purchaseDocuments }),
      });
      const json = (await res.json()) as ProprietorApiResponse & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Lookup failed");
      setProprietorData(json);
      if (bundle) {
        const merged = mergeProprietor(bundle, json, address);
        setBundle(merged);
        const newProprietor = merged.candidates.find(
          (c) => c.kind === "proprietor",
        );
        if (newProprietor) setSelectedKey(contactKey(newProprietor));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setProprietorLoading(false);
      setPurchaseLoading(false);
    }
  }

  async function createLetter() {
    if (!address) {
      setError("No address on this application.");
      return;
    }
    setLetterLoading(true);
    setError(null);
    try {
      const addresseeName = selectedIsManual
        ? (manualName.trim() || "Sir or Madam")
        : (selected?.name?.trim() || "Sir or Madam");
      const addressLines =
        (selected && !selectedIsManual && selected.addressLines.trim()) ||
        fullSiteAddress;
      const res = await fetch("/api/letter/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addresseeName,
          addressLines,
          reference,
          description,
          planningUrl,
          siteAddress: fullSiteAddress,
          planningEntity,
          persist: true,
          contactKind: selected?.kind ?? "manual",
          applicantName: bundle?.enrichment?.applicantName ?? null,
          agentName: bundle?.enrichment?.agentName ?? null,
          agentAddress: bundle?.enrichment?.agentAddress ?? null,
          agentEmail: bundle?.enrichment?.agentEmail ?? null,
          agentPhone: bundle?.enrichment?.agentPhone ?? null,
          caseOfficer: bundle?.caseOfficer ?? null,
          ward: bundle?.ward ?? null,
        }),
      });
      const json = (await res.json()) as {
        html?: string;
        body?: string;
        letterId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not create letter");
      posthog.capture("letter_created", {
        planning_reference: reference,
        contact_kind: selected?.kind ?? "manual",
        has_addressee: addresseeName !== "Sir or Madam",
      });
      setLetterHtml(json.html ?? null);
      setLetterBody(json.body ?? null);
      setLetterId(json.letterId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLetterLoading(false);
    }
  }

  function printLetter() {
    if (!letterId) return;
    // Open the server-rendered PDF in a new tab for a clean print dialog.
    window.open(`/api/letter/pdf?id=${letterId}`, "_blank", "noopener");
  }

  const needsPurchase = proprietorData?.proprietorSource === "needs_purchase";
  const hasAnyEnrichment = useMemo(() => {
    const e = bundle?.enrichment;
    return Boolean(
      e?.agentName || e?.applicantName || bundle?.caseOfficer || bundle?.ward,
    );
  }, [bundle]);

  if (!application) {
    return (
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <p className="text-sm text-zinc-600">No application selected.</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="relative max-h-[90vh] overflow-y-auto overflow-x-hidden sm:max-w-xl">
        <DialogHeader>
          <p className="editorial-chapter-label text-zinc-500">
            Outreach letter
          </p>
          <DialogTitle>Draft a letter to the right contact</DialogTitle>
          <DialogDescription>
            Candidates are resolved from official registers. You are responsible
            for UK GDPR and PECR compliance.
          </DialogDescription>
        </DialogHeader>

        <div ref={revealRef} className="space-y-5 text-sm">
          {address ? (
            <div data-reveal className="rounded-lg border border-zinc-200 bg-white p-3">
              <p className="editorial-chapter-label text-zinc-500">
                Site address
              </p>
              <p className="mt-1 text-sm text-zinc-800 leading-snug break-words">
                {fullSiteAddress}
              </p>
            </div>
          ) : (
            <p className="text-sm text-red-600">No address on this record.</p>
          )}

          {letterHtml ? (
            <div className="editorial-hairline space-y-3 pt-4">
              <p className="editorial-chapter-label text-zinc-500">
                Letter preview
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={printLetter}
                  className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2"
                >
                  <Printer className="h-4 w-4" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setAssistOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
                >
                  <Sparkles className="h-4 w-4" />
                  AI assist
                </button>
                <button
                  type="button"
                  onClick={() => setLetterHtml(null)}
                  className="ml-auto text-sm text-zinc-600 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
                >
                  Back
                </button>
              </div>
              {letterId ? (
                previewLoading && !previewSrcDoc ? (
                  <div className="flex h-[min(420px,50vh)] items-center justify-center rounded-md border border-zinc-200 bg-white">
                    <PulseIndicator label="Updating preview" />
                  </div>
                ) : (
                  <iframe
                    id="letter-preview-frame"
                    key={previewIframeKey}
                    title="Letter preview"
                    className="h-[min(420px,50vh)] w-full rounded-md border border-zinc-200 bg-white"
                    srcDoc={previewSrcDoc}
                  />
                )
              ) : (
                <iframe
                  id="letter-preview-frame"
                  title="Letter preview"
                  className="h-[min(420px,50vh)] w-full rounded-md border border-zinc-200 bg-white"
                  srcDoc={letterHtml}
                />
              )}
            </div>
          ) : (
            <>
              <section data-reveal className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="editorial-chapter-label text-zinc-500">
                    Choose addressee
                  </p>
                  {bundle ? (
                    <ConfidenceTooltip
                      confidence={bundle.confidence}
                      label={`${bundle.confidence} confidence`}
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ring-1",
                        confidencePillClass(bundle.confidence),
                      )}
                    />
                  ) : null}
                </div>

                {bundleLoading && !bundle ? (
                  <div className="flex items-center gap-3 border-l-2 border-zinc-300 bg-stone-50 px-3 py-3 text-xs text-zinc-600">
                    <WaveformLoader
                      className="shrink-0"
                      label="Resolving contacts"
                    />
                    <span>
                      Resolving contacts from official registers and corporate
                      records…
                    </span>
                  </div>
                ) : candidates.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No candidates yet. Use <em>Find proprietor</em> below or
                    enter a name manually.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {candidates.map((c) => {
                      const key = contactKey(c);
                      const active = key === selectedKey;
                      const Icon = kindIcon(c.kind);
                      return (
                        <label
                          key={key}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                            active
                              ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                              : "border-zinc-200 bg-white hover:border-zinc-400",
                          )}
                        >
                          <input
                            type="radio"
                            name="outreach-candidate"
                            className="mt-1 accent-zinc-900"
                            checked={active}
                            onChange={() => setSelectedKey(key)}
                          />
                          <Icon className="h-4 w-4 shrink-0 text-zinc-500 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="editorial-chapter-label text-zinc-500">
                                {kindLabel(c.kind)}
                              </p>
                              {c.kind !== "manual" ? (
                                <ConfidenceTooltip
                                  confidence={c.confidence}
                                  label={c.confidence}
                                  className={cn(
                                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ring-1",
                                    confidencePillClass(c.confidence),
                                  )}
                                />
                              ) : null}
                            </div>
                            <p className="mt-1 font-medium text-zinc-900 leading-snug break-words">
                              {c.kind === "manual"
                                ? "Enter a name manually"
                                : c.name}
                            </p>
                            {c.kind !== "manual" && c.addressLines ? (
                              <p className="text-xs text-zinc-500 leading-snug break-words">
                                {c.addressLines}
                              </p>
                            ) : null}
                            {(c.email || c.phone) && (
                              <p className="mt-0.5 text-[11px] text-zinc-600 break-all">
                                {[c.email, c.phone].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                {selectedIsManual ? (
                  <div>
                    <label className="editorial-chapter-label mb-1 block text-zinc-500">
                      Addressee
                    </label>
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                      placeholder="e.g. Sir or Madam"
                    />
                  </div>
                ) : null}
              </section>

              {hasAnyEnrichment ? (
                <section data-reveal className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p className="editorial-chapter-label text-zinc-500">
                    Application context
                  </p>
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-zinc-700">
                    {bundle?.caseOfficer ? (
                      <>
                        <dt className="text-zinc-500">Case officer</dt>
                        <dd className="text-zinc-800">{bundle.caseOfficer}</dd>
                      </>
                    ) : null}
                    {bundle?.ward ? (
                      <>
                        <dt className="text-zinc-500">Ward</dt>
                        <dd className="text-zinc-800">{bundle.ward}</dd>
                      </>
                    ) : null}
                  </dl>
                </section>
              ) : null}

              <div data-reveal>
              <Callout
                variant="info"
                label="Property ownership lookup"
                title="Registered proprietor (optional)"
                actions={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={proprietorLoading || !address}
                      onClick={() => void findProprietor(false)}
                      className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition-colors hover:border-zinc-900 disabled:opacity-50"
                    >
                      {proprietorLoading ? (
                        <WaveformLoader className="h-3.5" />
                      ) : (
                        <Search className="h-3.5 w-3.5" />
                      )}
                      Find proprietor
                    </button>
                    {needsPurchase ? (
                      <button
                        type="button"
                        disabled={purchaseLoading}
                        onClick={() => void findProprietor(true)}
                        className="inline-flex items-center gap-2 rounded-md border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {purchaseLoading ? (
                          <WaveformLoader tone="inverse" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                        Purchase Land Registry extract
                      </button>
                    ) : null}
                  </div>
                }
              >
                <p>
                  Adding a registered proprietor may incur per-document fees.
                  Only use when you need an official owner name.
                </p>
                {proprietorData?.warnings?.length ? (
                  <ul className="mt-2 list-disc list-inside space-y-1 text-[11px] text-zinc-600">
                    {proprietorData.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
              </Callout>
              </div>

              <div data-reveal className="editorial-hairline pt-4">
                <button
                  type="button"
                  disabled={letterLoading || !address || !selected}
                  onClick={() => void createLetter()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 disabled:opacity-50"
                >
                  {letterLoading ? (
                    <PulseIndicator tone="inverse" label="Creating" />
                  ) : (
                    <Mail className="h-4 w-4" />
                  )}
                  {letterLoading ? "Creating letter" : "Create letter"}
                </button>
              </div>
            </>
          )}

          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {/* Drawer inside DialogContent so it shares stacking context */}
        <LetterAssistDrawer
          open={assistOpen}
          onOpenChange={setAssistOpen}
          currentHtml={letterBody ?? ""}
          reference={reference}
          siteAddress={address}
          onApply={async (nextBody) => {
            setLetterBody(nextBody);
            if (letterId) {
              try {
                const res = await fetch(`/api/letter/${letterId}`, {
                  method: "PATCH",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ bodyHtml: nextBody }),
                });
                if (!res.ok) throw new Error("Failed to save rewrite");
              } catch {
                setError("Rewrite applied in preview but could not save — try again before printing.");
              }
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
