"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  User,
  Building,
  MapPin,
  ExternalLink,
  Mail,
  Phone,
  UserCheck,
  Map as MapIcon,
} from "lucide-react";
import { ResearchBriefingCard } from "./research-briefing-card";
import { ConfidenceTooltip } from "./confidence-tooltip";
import { PlanningQaPanel, type QaResultPinActions } from "./planning-qa-panel";
import { WaveformLoader } from "./ui/loading-indicators";
import { SkeletonModalBody } from "./ui/skeleton";
import { Callout } from "./ui/callout";
import { useMountReveal } from "@/lib/animation/use-mount-reveal";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import type {
  OutreachContact,
  OutreachContactBundle,
} from "@/lib/outreach-contact";
import {
  buildOutreachContactCacheKeyFromParams,
  getOutreachContactSessionCache,
  setOutreachContactSessionCache,
} from "@/lib/outreach-contact-session-cache";

export type ApplicantModalHandoff = {
  reference: string;
  application: {
    entity: number | null;
    reference: string | null;
    organisationEntity: string | number | null;
    siteAddress: string | null;
    description: string | null;
    applicationType: string | null;
    status: string | null;
    postcode: string | null;
    point: string | null;
  };
  contact: OutreachContact;
};

export function ApplicantModal({
  reference,
  organisationEntity,
  planningEntity,
  siteAddress,
  description,
  applicationType,
  status,
  lpaName,
  postcode,
  point,
  seedApplicant,
  seedAgent,
  seedAgentAddress,
  isOpen,
  onClose,
  onDraftLetter,
  onViewApplicant,
  onSearchResults,
  pinActions,
}: {
  reference: string | null;
  /** Planning Data `organisation-entity` — used to resolve PlanWire council. */
  organisationEntity?: string | number | null;
  /** Planning Data entity id (primary key of the application). */
  planningEntity?: number | null;
  siteAddress?: string | null;
  description?: string | null;
  applicationType?: string | null;
  status?: string | null;
  lpaName?: string | null;
  postcode?: string | null;
  point?: string | null;
  /** Already-known applicant/company from the search row (passed to the agent as a seed). */
  seedApplicant?: string | null;
  seedAgent?: string | null;
  seedAgentAddress?: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** Called when the user clicks "Draft outreach letter from this contact". */
  onDraftLetter?: (h: ApplicantModalHandoff) => void;
  /** Open a chat result in this modal (re-seeds the focused case). */
  onViewApplicant?: (row: PlanningApplicationEntity) => void;
  /** Fired when a chat search returns results, so the host can sync map/sidebar. */
  onSearchResults?: (entities: PlanningApplicationEntity[]) => void;
  /** Pin / tracking on chat search results (mirrors dashboard sidebar). */
  pinActions?: QaResultPinActions;
}) {
  const [bundle, setBundle] = useState<OutreachContactBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const revealRef = useMountReveal<HTMLDivElement>(isOpen && !loading && !!bundle);

  useEffect(() => {
    if (!isOpen || !reference || planningEntity == null) return;

    const params = new URLSearchParams({ reference: reference! });
    params.set("planning_entity", String(planningEntity));
    if (organisationEntity != null && String(organisationEntity) !== "") {
      params.set("organisation_entity", String(organisationEntity));
    }
    if (siteAddress) params.set("site_address", siteAddress);
    if (seedApplicant) params.set("seed_applicant", seedApplicant);
    if (seedAgent) params.set("seed_agent", seedAgent);
    if (seedAgentAddress) params.set("seed_agent_address", seedAgentAddress);
    const cacheKey = buildOutreachContactCacheKeyFromParams(params);
    const fromSession = getOutreachContactSessionCache(cacheKey);
    if (fromSession) {
      queueMicrotask(() => {
        setBundle(fromSession);
        setError(null);
        setLoading(false);
        setLoadingStage("");
      });
      return;
    }

    let mounted = true;
    queueMicrotask(() => setBundle(null));

    async function fetchBundle() {
      setLoading(true);
      setLoadingStage("Checking cache...");
      setError(null);

      const stageTimer = setInterval(() => {
        setLoadingStage((prev) => {
          if (prev === "Checking cache...") return "Searching planning register...";
          if (prev === "Searching planning register...") return "Checking council portal...";
          if (prev === "Checking council portal...")
            return "Searching corporate records...";
          if (prev === "Searching corporate records...") return "Web search...";
          if (prev === "Web search...") return "Merging results...";
          return "Almost done...";
        });
      }, 3000);

      try {
        const res = await fetch(`/api/outreach/contact?${params.toString()}`);
        const json = await res.json();

        clearInterval(stageTimer);
        if (!mounted) return;

        if (!res.ok) {
          throw new Error(json.error || "Failed to fetch applicant data");
        }
        const b = json as OutreachContactBundle;
        setOutreachContactSessionCache(cacheKey, b);
        setBundle(b);
      } catch (err) {
        clearInterval(stageTimer);
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        clearInterval(stageTimer);
        if (mounted) {
          setLoading(false);
          setLoadingStage("");
        }
      }
    }

    void fetchBundle();

    return () => {
      mounted = false;
    };
  }, [
    isOpen,
    reference,
    organisationEntity,
    planningEntity,
    siteAddress,
    seedApplicant,
    seedAgent,
    seedAgentAddress,
  ]);

  const enrichment = bundle?.enrichment ?? null;
  const hasAnyName = Boolean(
    enrichment?.applicantName || enrichment?.agentName,
  );
  const topContact = bundle?.candidates.find((c) => c.kind !== "manual") ?? null;

  function handleDraftLetter() {
    if (!onDraftLetter || !reference || !topContact) return;
    onDraftLetter({
      reference,
      application: {
        entity: planningEntity ?? null,
        reference,
        organisationEntity: organisationEntity ?? null,
        siteAddress: siteAddress ?? bundle?.siteAddress ?? null,
        description: description ?? null,
        applicationType: applicationType ?? null,
        status: status ?? null,
        postcode: postcode ?? null,
        point: point ?? null,
      },
      contact: topContact,
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <p className="editorial-chapter-label text-zinc-500">Applicant</p>
          <DialogTitle>Who is behind this application?</DialogTitle>
          <DialogDescription>
            Reference <span className="font-mono text-zinc-700">{reference}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[150px] flex flex-col justify-center">
          {loading ? (
            <div className="space-y-6 py-2">
              <div className="flex items-center gap-3 border-l-2 border-zinc-300 bg-stone-50 px-4 py-3">
                <WaveformLoader label="Searching" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-zinc-900">
                    {loadingStage}
                  </p>
                  <p className="editorial-chapter-label text-zinc-400">
                    Searching multiple data sources
                  </p>
                </div>
              </div>
              <SkeletonModalBody />
            </div>
          ) : error ? (
            <div className="text-center">
              <p className="text-sm text-red-600 mb-2">{error}</p>
              <p className="text-xs text-zinc-500">
                The LPA name may not match our council lists, the case may not
                be indexed yet, or the reference format may differ from the
                local register.
              </p>
            </div>
          ) : bundle ? (
            <div ref={revealRef} className="space-y-4">
              {bundle.applicantNamesNotInFeed && !hasAnyName ? (
                <div data-reveal>
                <Callout
                  variant="info"
                  label="Public register"
                  title="Applicant name held by the LPA"
                  actions={
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium">
                      {bundle.url ? (
                        <a
                          href={bundle.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-zinc-900 underline hover:text-zinc-700"
                        >
                          Open case on LPA system
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {bundle.councilWebsite ? (
                        <a
                          href={bundle.councilWebsite}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-zinc-900 underline hover:text-zinc-700"
                        >
                          Local planning authority website
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  }
                >
                  Our primary data sources do not include applicant or agent
                  names for this specific application. Named applicants on the
                  public register are held by each local authority; our feeds
                  are not a 100% substitute for that register.
                </Callout>
                </div>
              ) : null}

              <div data-reveal className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4">
                <User className="h-5 w-5 text-zinc-500 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="editorial-chapter-label text-zinc-500">
                    Applicant
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">
                    {enrichment?.applicantName || "Not provided"}
                  </p>
                  {enrichment?.applicantAddress ? (
                    <p className="mt-1 text-xs text-zinc-500 leading-snug">
                      {enrichment.applicantAddress}
                    </p>
                  ) : null}
                  {enrichment?.applicantEmail ? (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3 text-zinc-400" />
                        {enrichment.applicantEmail}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div data-reveal className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4">
                <Building className="h-5 w-5 text-zinc-500 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="editorial-chapter-label text-zinc-500">
                    Agent / Company
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-900 truncate">
                    {enrichment?.agentName || "Not provided"}
                  </p>
                  {enrichment?.agentAddress ? (
                    <p className="mt-1 text-xs text-zinc-500 leading-snug">
                      {enrichment.agentAddress}
                    </p>
                  ) : null}
                  {(enrichment?.agentEmail || enrichment?.agentPhone) && (
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
                      {enrichment?.agentEmail ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3 w-3 text-zinc-400" />
                          {enrichment.agentEmail}
                        </span>
                      ) : null}
                      {enrichment?.agentPhone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3 text-zinc-400" />
                          {enrichment.agentPhone}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>

              <div data-reveal className="flex items-start gap-3 rounded-lg border border-zinc-200 bg-white p-4">
                <MapPin className="h-5 w-5 text-zinc-500 mt-0.5" />
                <div>
                  <p className="editorial-chapter-label text-zinc-500">
                    Site address
                  </p>
                  <p className="mt-1 text-sm text-zinc-800 leading-snug">
                    {bundle.siteAddress || siteAddress || "Not provided"}
                  </p>
                </div>
              </div>

              {(bundle.caseOfficer || bundle.ward) && (
                <div data-reveal className="grid grid-cols-2 gap-3">
                  {bundle.caseOfficer ? (
                    <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white p-3">
                      <UserCheck className="h-5 w-5 text-zinc-500 mt-0.5" />
                      <div className="min-w-0">
                        <p className="editorial-chapter-label text-zinc-500">
                          Case officer
                        </p>
                        <p className="mt-1 text-sm text-zinc-800 truncate">
                          {bundle.caseOfficer}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {bundle.ward ? (
                    <div className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white p-3">
                      <MapIcon className="h-5 w-5 text-zinc-500 mt-0.5" />
                      <div className="min-w-0">
                        <p className="editorial-chapter-label text-zinc-500">
                          Ward
                        </p>
                        <p className="mt-1 text-sm text-zinc-800 truncate">
                          {bundle.ward}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {hasAnyName && (
                <div data-reveal>
                  <ResearchBriefingCard
                    displayName={
                      enrichment?.agentName ||
                      enrichment?.applicantName ||
                      undefined
                    }
                    hint={
                      reference ? `Planning application ${reference}` : undefined
                    }
                  />
                </div>
              )}

              {onDraftLetter && topContact ? (
                <div data-reveal className="editorial-hairline pt-3">
                  <button
                    type="button"
                    onClick={handleDraftLetter}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2"
                  >
                    <Mail className="h-4 w-4" />
                    Draft outreach letter from this contact
                  </button>
                </div>
              ) : null}

              <PlanningQaPanel
                key={reference ?? "no-ref"}
                application={{
                  reference: reference ?? undefined,
                  planningEntity: planningEntity ?? undefined,
                  organisationEntity: organisationEntity ?? undefined,
                  siteAddress:
                    siteAddress ?? bundle.siteAddress ?? undefined,
                  description: description ?? undefined,
                  applicationType: applicationType ?? undefined,
                  status: status ?? undefined,
                  lpaName: lpaName ?? undefined,
                  postcode: postcode ?? undefined,
                  applicantName: seedApplicant ?? undefined,
                }}
                onViewApplicant={onViewApplicant}
                onResults={onSearchResults}
                pinActions={pinActions}
                className="max-h-[520px]"
              />

              {bundle.confidence && (
                <div className="editorial-hairline flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-3">
                  <ConfidenceTooltip
                    confidence={bundle.confidence}
                    label={`Confidence · ${bundle.confidence}`}
                    className="editorial-chapter-label text-zinc-400"
                  />
                </div>
              )}

              {/* {!bundle.applicantNamesNotInFeed &&
              (bundle.url || bundle.councilWebsite) ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {bundle.url ? (
                    <a
                      href={bundle.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
                    >
                      LPA case link <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                  {bundle.councilWebsite ? (
                    <a
                      href={bundle.councilWebsite}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
                    >
                      Authority website <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              ) : null} */}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
