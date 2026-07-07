"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampBboxToSearchable,
  type PlanningApplicationEntity,
  type PlanningSearchResponse,
} from "@/lib/planning-data";
import { MapCanvas, type Bounds, type MapCanvasHandle } from "./map-canvas";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import { MapPin, Calendar, Building, Download, Search, Settings2, User, Mail, UserCircle2, Bookmark, X, Pin, RadioTower } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import posthog from "posthog-js";
import { cn } from "@/lib/utils";
import { ApplicantModal, type ApplicantModalHandoff } from "@/components/applicant-modal";
import { ProprietorLetterModal } from "@/components/proprietor-letter-modal";
import type { OutreachContact } from "@/lib/outreach-contact";
import { NlSearchBar, type NlFilterResult, type NlFilterChip } from "./nl-search-bar";
import { buildNlFiltersFromDashboardState } from "@/lib/ai/build-nl-filters-from-dashboard";
import { consumeDeepSearchStream } from "@/lib/ai/deep-search-stream";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { SkeletonCard } from "@/components/ui/skeleton";
import type { PlanFeatures } from "@/lib/plan-features";

const PAGE_SIZE = 50;

// Slimmed meta shape — `PlanningSearchResponse` includes an `entities` field
// that is a full copy of the same rows already stored in `results`. Persisting
// that doubles the payload for no gain (no UI path reads `meta.entities`), so
// we strip it on save and restore.
type RunSearchFilterSnapshot = {
  indexedSinceYear: string;
  developmentTypes: string[];
  applicationTypes: string[];
  statuses: string[];
  decisionFrom: string;
  decisionTo: string;
};

type PersistedMeta = Omit<PlanningSearchResponse, "entities">;

// Stored dashboard state is treated as a best-effort cache: if the shape
// drifts we silently ignore it rather than throwing during hydration.
type PersistedDashboardState = {
  bounds: Bounds | null;
  filters: {
    indexedSinceYear: string;
    developmentTypes: string[];
    applicationTypes: string[];
    statuses: string[];
    decisionFrom: string;
    decisionTo: string;
  };
  nl: {
    summary: string | null;
    locationHint: string | null;
    keywords: string[];
    applicantLike: string | null;
  };
  offset: number;
  results: PlanningApplicationEntity[];
  meta: PersistedMeta | null;
  savedAt: string;
};

type PinnedApplicationRow = {
  id: string;
  reference: string;
  councilId: string | null;
};

function pinnedKey(reference: string | null | undefined, councilId: string | null | undefined) {
  return `${reference ?? ""}::${councilId ?? ""}`;
}

function TrackingPulse({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      gsap.to(ref.current, {
        scale: 1.45,
        opacity: 0,
        duration: 1.2,
        ease: "power2.out",
        repeat: -1,
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <span
      ref={ref}
      className={cn(
        "absolute inset-0 rounded-full border border-emerald-400/70 bg-emerald-400/15",
        className,
      )}
      aria-hidden
    />
  );
}

function downloadCsv(rows: PlanningApplicationEntity[]) {
  const headers = [
    "entity",
    "reference",
    "address",
    "status",
    "decision_type",
    "decision_date",
    "organisation_entity",
    "description",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.entity,
        csv(r.reference),
        csv(r["address-text"]),
        csv(r["planning-application-status"]),
        csv(r["planning-decision-type"]),
        csv(r["decision-date"]),
        csv(r["organisation-entity"]),
        csv(r.description),
      ].join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "planning-applications.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function csv(v: string | number | undefined) {
  if (v == null) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

function FilterMulti({
  label,
  values,
  onChange,
  options,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
}) {
  const toggle = (opt: string) => {
    onChange(
      values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt],
    );
  };
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-zinc-700">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = values.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
                active
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardClient({ features }: { features: PlanFeatures }) {
  const searchParams = useSearchParams();
  const [results, setResults] = useState<PlanningApplicationEntity[]>([]);
  const [meta, setMeta] = useState<PlanningSearchResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [indexedSinceYear, setIndexedSinceYear] = useState<string>("");
  const [developmentTypes, setDevelopmentTypes] = useState<string[]>([]);
  const [applicationTypes, setApplicationTypes] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [decisionFrom, setDecisionFrom] = useState("");
  const [decisionTo, setDecisionTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [lastBounds, setLastBounds] = useState<Bounds | null>(null);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState("");
  const [saveSearchPending, setSaveSearchPending] = useState(false);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nlSummary, setNlSummary] = useState<string | null>(null);
  const [nlLocationHint, setNlLocationHint] = useState<string | null>(null);
  const [nlKeywords, setNlKeywords] = useState<string[]>([]);

  const mapRef = useRef<MapCanvasHandle | null>(null);
  const [nlApplicantLike, setNlApplicantLike] = useState<string | null>(null);
  // Which `?savedSearch=` id we already applied (avoids duplicate work in React
  // Strict Mode; reset when the param is absent so another saved search can load).
  const digestProcessedSavedSearchIdRef = useRef<string | null>(null);
  // Guards the mount-restore effect from re-running and avoids persisting
  // the hydration itself back to the server.
  const restoreAttemptedRef = useRef(false);
  const hasHydratedRef = useRef(false);
  // Handle for the debounced persist timer so we can coalesce rapid updates
  // (filter toggles, pagination) into a single PUT.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The most recent payload we'd like to persist, updated synchronously on
  // every relevant state change. The debounced timer reads from this ref at
  // fire time so it always sees the freshest snapshot; the unmount effect
  // reads it to flush any pending save when the user navigates away.
  const latestPayloadRef = useRef<PersistedDashboardState | null>(null);
  // Non-zero while a deep-search stream is actively running. Used to block
  // in-flight `runSearch` calls from `onSearchArea`/pagination.
  const streamInFlightRef = useRef(0);
  // Count of pending filter-change effect runs that came from a deep-search
  // `onParsed` callback. Each applyNlFilters increments; the filter-change
  // effect decrements when it runs and skips its `runSearch`. This survives
  // across React's batching and the retry stream so the effect can't leak a
  // stale bbox GET after the stream has finished delivering results.
  const pendingNlEffectsRef = useRef(0);
  /** True when tag/date/nl-chip was changed by the user (not restore / NL). */
  const manualFiltersDirtyRef = useRef(false);
  /** Blocks tag-driven deep search while state is bulk-applied (restore / email link). */
  const suppressManualFilterDeepSearchRef = useRef(false);
  const manualFilterDeepSearchTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const manualFilterSearchAbortRef = useRef<AbortController | null>(null);

  const markManualFilterChange = useCallback(() => {
    manualFiltersDirtyRef.current = true;
  }, []);

  const toggleApplicantLikeFromTag = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      markManualFilterChange();
      setNlApplicantLike((prev) => (prev === trimmed ? null : trimmed));
    },
    [markManualFilterChange],
  );

  const handleStreamStart = useCallback(() => {
    streamInFlightRef.current += 1;
    setSearching(true);
  }, []);
  const handleStreamEnd = useCallback(() => {
    streamInFlightRef.current = Math.max(0, streamInFlightRef.current - 1);
    setSearching(false);
  }, []);

  const applyNlFilters = useCallback((f: NlFilterResult) => {
    // Every state update below may cause the filter-change effect below to
    // fire. Tell the effect to skip exactly this many times before it's
    // allowed to run a manual runSearch again.
    pendingNlEffectsRef.current += 1;
    setStatuses(f.statuses);
    setApplicationTypes(f.applicationTypes);
    setDevelopmentTypes(f.developmentTypes);
    setDecisionFrom(f.decisionFrom ?? "");
    setDecisionTo(f.decisionTo ?? "");
    if (f.indexedSinceYear != null) {
      setIndexedSinceYear(String(f.indexedSinceYear));
    } else {
      setIndexedSinceYear("");
    }
    setNlLocationHint(f.locationHint);
    setNlKeywords(f.keywords);
    setNlApplicantLike(f.applicantLike);
    setNlSummary(f.summary);
  }, []);

  const handleDeepSearchViewport = useCallback(
    (bounds: Bounds, place: string | null) => {
      mapRef.current?.panAndZoomTo(bounds);
      setLastBounds(bounds);
      if (place) {
        toast.info(`Showing results in ${place}.`);
      }
    },
    [],
  );

  const handleDeepSearchResults = useCallback(
    (
      entities: PlanningApplicationEntity[],
      meta: { total: number; mode: "fast" | "agent" },
    ) => {
      setResults(entities);
      setMeta({ entities, count: meta.total });
      setOffset(0);
      setError(null);
      setSearching(false);
      posthog.capture("deep_search_completed", {
        mode: meta.mode,
        total: meta.total,
      });
    },
    [],
  );

  const getCurrentBounds = useCallback((): Bounds | null => {
    return mapRef.current?.getCurrentBounds() ?? lastBounds;
  }, [lastBounds]);

  /**
   * Fit the map to a set of result entities by deriving a bbox from their
   * `POINT(lng lat)` values. Used to sync the map when a chat search (from the
   * applicant modal's Q&A panel) returns results. No-op when no points.
   */
  const fitMapToEntities = useCallback(
    (entities: PlanningApplicationEntity[]) => {
      const coords: Array<{ lng: number; lat: number }> = [];
      for (const e of entities) {
        const m = e.point?.match(/POINT\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)/i);
        if (!m) continue;
        const lng = Number(m[1]);
        const lat = Number(m[2]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        // Drop "Null Island" (0,0) — PlanWire rows without coordinates default
        // to 0/0, which would otherwise fly the map into the ocean (grey).
        if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) continue;
        // PlanWire is UK-only; ignore anything well outside a generous UK box
        // so a stray/garbage coordinate can't blank the map.
        if (lat < 49 || lat > 61 || lng < -11 || lng > 2) continue;
        coords.push({ lng, lat });
      }
      // No usable coordinates — leave the map where it is rather than jumping.
      if (coords.length === 0) return;

      // Fit to the DENSE cluster, not the extremes. Results can span the whole
      // country (e.g. a keyword search hitting several councils); a single
      // far-flung outlier would otherwise stretch the bbox to the entire UK.
      // We trim to the 10th–90th percentile of lat/lng independently so the map
      // frames where most results actually are.
      const lats = coords.map((c) => c.lat).sort((a, b) => a - b);
      const lngs = coords.map((c) => c.lng).sort((a, b) => a - b);
      const percentile = (sorted: number[], p: number): number => {
        if (sorted.length === 1) return sorted[0];
        const idx = Math.min(
          sorted.length - 1,
          Math.max(0, Math.round((sorted.length - 1) * p)),
        );
        return sorted[idx];
      };
      // With few points, outlier-trimming isn't meaningful — use full extent.
      const lo = coords.length >= 5 ? 0.1 : 0;
      const hi = coords.length >= 5 ? 0.9 : 1;
      const south = percentile(lats, lo);
      const north = percentile(lats, hi);
      const west = percentile(lngs, lo);
      const east = percentile(lngs, hi);

      // Pad so single-point / tight clusters aren't a zero-area bbox, and clamp
      // the overall span so we never zoom out past a city-region view.
      const pad = 0.01;
      const MAX_SPAN_DEG = 0.6; // ~55-65km; keeps it at borough/city scale
      const clampSpan = (min: number, max: number): [number, number] => {
        const span = max - min;
        if (span <= MAX_SPAN_DEG) return [min - pad, max + pad];
        const mid = (min + max) / 2;
        return [mid - MAX_SPAN_DEG / 2, mid + MAX_SPAN_DEG / 2];
      };
      const [southC, northC] = clampSpan(south, north);
      const [westC, eastC] = clampSpan(west, east);
      const bounds: Bounds = {
        west: westC,
        south: southC,
        east: eastC,
        north: northC,
      };
      mapRef.current?.panAndZoomTo(bounds);
      setLastBounds(bounds);
    },
    [],
  );

  const handleQaSearchResults = useCallback(
    (entities: PlanningApplicationEntity[]) => {
      handleDeepSearchResults(entities, {
        total: entities.length,
        mode: "fast",
      });
      fitMapToEntities(entities);
    },
    [handleDeepSearchResults, fitMapToEntities],
  );

  const handleQaViewApplicant = useCallback(
    (row: PlanningApplicationEntity) => {
      if (!row.reference) return;
      openApplicantModal(row.reference, row["organisation-entity"] ?? null, {
        planningEntity: row.entity ?? null,
        siteAddress: row["address-text"] ?? null,
        description: row.description ?? null,
        applicationType: row["planning-application-type"] ?? null,
        status: row["planning-application-status"] ?? null,
        postcode: row.postcode ?? null,
        point: row.point ?? null,
        seedApplicant: row.enrichment?.applicantName ?? null,
        seedAgent: row.enrichment?.agentName ?? null,
        seedAgentAddress: row.enrichment?.agentAddress ?? null,
      });
    },
    // openApplicantModal is a stable module-scope closure defined below in the
    // component; it does not need to be in deps (it only calls setState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const runManualFilterDeepSearch = useCallback(async () => {
    if (suppressManualFilterDeepSearchRef.current) return;
    manualFiltersDirtyRef.current = false;
    const bounds = getCurrentBounds() ?? lastBounds;
    if (!bounds) {
      toast.error(
        "No map area to search. Pan the map to the area you want, then try your filters again.",
      );
      return;
    }
    const built = buildNlFiltersFromDashboardState({
      statuses,
      applicationTypes,
      developmentTypes,
      decisionFrom,
      decisionTo,
      indexedSinceYear,
      locationHint: nlLocationHint,
      applicantLike: nlApplicantLike,
      keywords: nlKeywords,
    });
    if (!built.ok) {
      toast.error(built.error);
      return;
    }
    manualFilterSearchAbortRef.current?.abort();
    const ctrl = new AbortController();
    manualFilterSearchAbortRef.current = ctrl;
    setError(null);
    handleStreamStart();
    posthog.capture("deep_search_manual_filters_submitted", {
      status_count: built.filters.statuses.length,
      type_count: built.filters.applicationTypes.length,
      dev_type_count: built.filters.developmentTypes.length,
    });
    try {
      const { lastError, resultsMeta, httpError } = await consumeDeepSearchStream(
        {
          filters: built.filters,
          currentBounds: bounds,
          forceAgent: false,
        },
        {
          onParsed: applyNlFilters,
          onViewport: handleDeepSearchViewport,
          onResults: handleDeepSearchResults,
        },
        { signal: ctrl.signal },
      );
      if (httpError) {
        toast.error(httpError);
        return;
      }
      if (lastError && !resultsMeta) {
        toast.error(lastError);
        return;
      }
      if (lastError && resultsMeta && resultsMeta.total === 0) {
        toast.info(lastError, { duration: 8000 });
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      toast.error(e instanceof Error ? e.message : "Filter search failed");
    } finally {
      handleStreamEnd();
    }
  }, [
    lastBounds,
    getCurrentBounds,
    statuses,
    applicationTypes,
    developmentTypes,
    decisionFrom,
    decisionTo,
    indexedSinceYear,
    nlLocationHint,
    nlApplicantLike,
    nlKeywords,
    applyNlFilters,
    handleDeepSearchViewport,
    handleDeepSearchResults,
    handleStreamStart,
    handleStreamEnd,
  ]);

  const clearSearch = useCallback(async () => {
    manualFilterSearchAbortRef.current?.abort();
    manualFilterSearchAbortRef.current = null;
    if (manualFilterDeepSearchTimerRef.current) {
      clearTimeout(manualFilterDeepSearchTimerRef.current);
      manualFilterDeepSearchTimerRef.current = null;
    }
    manualFiltersDirtyRef.current = false;
    // Reset local UI state
    setResults([]);
    setMeta(null);
    setLastBounds(null);
    setOffset(0);
    setError(null);
    setSelectedEntityId(null);
    // Reset filters
    setIndexedSinceYear("");
    setDevelopmentTypes([]);
    setApplicationTypes([]);
    setStatuses([]);
    setDecisionFrom("");
    setDecisionTo("");
    // Reset NL metadata
    setNlSummary(null);
    setNlLocationHint(null);
    setNlKeywords([]);
    setNlApplicantLike(null);
    // Clear persisted state on server
    try {
      await fetch("/api/dashboard-state", { method: "DELETE" });
    } catch {
      // Ignore network errors — local state is already cleared
    }
  }, []);

  /* eslint-disable react-hooks/refs -- chip callbacks run on click, not during render */
  const nlChips: NlFilterChip[] = useMemo(() => {
    const chips: NlFilterChip[] = [];
    for (const s of statuses) {
      chips.push({
        label: `Status: ${s}`,
        onRemove: () => {
          markManualFilterChange();
          setStatuses((prev) => prev.filter((x) => x !== s));
        },
      });
    }
    for (const t of applicationTypes) {
      chips.push({
        label: `Type: ${t}`,
        onRemove: () => {
          markManualFilterChange();
          setApplicationTypes((prev) => prev.filter((x) => x !== t));
        },
      });
    }
    for (const d of developmentTypes) {
      chips.push({
        label: `Dev: ${d}`,
        onRemove: () => {
          markManualFilterChange();
          setDevelopmentTypes((prev) => prev.filter((x) => x !== d));
        },
      });
    }
    if (indexedSinceYear.trim() !== "" && !Number.isNaN(Number(indexedSinceYear))) {
      chips.push({
        label: `Since ${indexedSinceYear.trim()}`,
        onRemove: () => {
          markManualFilterChange();
          setIndexedSinceYear("");
        },
      });
    }
    if (decisionFrom) {
      chips.push({
        label: `From ${decisionFrom}`,
        onRemove: () => {
          markManualFilterChange();
          setDecisionFrom("");
        },
      });
    }
    if (decisionTo) {
      chips.push({
        label: `To ${decisionTo}`,
        onRemove: () => {
          markManualFilterChange();
          setDecisionTo("");
        },
      });
    }
    if (nlLocationHint) {
      chips.push({
        label: `Near ${nlLocationHint}`,
        onRemove: () => {
          markManualFilterChange();
          setNlLocationHint(null);
        },
      });
    }
    if (nlApplicantLike) {
      chips.push({
        label: `Applicant: ${nlApplicantLike}`,
        onRemove: () => {
          markManualFilterChange();
          setNlApplicantLike(null);
        },
      });
    }
    for (const kw of nlKeywords) {
      chips.push({
        label: `"${kw}"`,
        onRemove: () => {
          markManualFilterChange();
          setNlKeywords((prev) => prev.filter((x) => x !== kw));
        },
      });
    }
    return chips;
  }, [
    markManualFilterChange,
    statuses,
    applicationTypes,
    developmentTypes,
    indexedSinceYear,
    decisionFrom,
    decisionTo,
    nlLocationHint,
    nlApplicantLike,
    nlKeywords,
  ]);
  /* eslint-enable react-hooks/refs */
  
  // Modal state
  const [applicantModalOpen, setApplicantModalOpen] = useState(false);
  const [selectedApplicant, setSelectedApplicant] = useState<{
    reference: string;
    organisationEntity: string | number | null;
    planningEntity?: number | null;
    siteAddress?: string | null;
    description?: string | null;
    applicationType?: string | null;
    status?: string | null;
    lpaName?: string | null;
    postcode?: string | null;
    point?: string | null;
    seedApplicant?: string | null;
    seedAgent?: string | null;
    seedAgentAddress?: string | null;
  } | null>(null);
  const [letterModalOpen, setLetterModalOpen] = useState(false);
  const [letterApplication, setLetterApplication] =
    useState<PlanningApplicationEntity | null>(null);
  const [pendingLetterContact, setPendingLetterContact] =
    useState<OutreachContact | null>(null);
  const resultsListRef = useRef<HTMLDivElement | null>(null);
  const [pinnedApplications, setPinnedApplications] = useState<
    Record<string, PinnedApplicationRow>
  >({});
  const [pinPendingKey, setPinPendingKey] = useState<string | null>(null);
  const [showTrackedOnly, setShowTrackedOnly] = useState(false);

  const isPinnedApplication = useCallback(
    (application: PlanningApplicationEntity) =>
      Boolean(pinnedApplications[pinnedKey(application.reference, application.councilId)]),
    [pinnedApplications],
  );

  const handleApplicantDraftLetter = useCallback(
    (h: ApplicantModalHandoff) => {
      const row = results.find((r) => r.reference === h.reference);
      if (row) {
        setLetterApplication(row);
      } else {
        setLetterApplication({
          entity: h.application.entity ?? 0,
          reference: h.application.reference ?? undefined,
          "address-text": h.application.siteAddress ?? undefined,
          description: h.application.description ?? undefined,
          "organisation-entity":
            h.application.organisationEntity != null
              ? String(h.application.organisationEntity)
              : undefined,
          "planning-application-status": h.application.status ?? undefined,
          "planning-application-type":
            h.application.applicationType ?? undefined,
          postcode: h.application.postcode ?? undefined,
          point: h.application.point ?? undefined,
        } as PlanningApplicationEntity);
      }
      setPendingLetterContact(h.contact);
      setApplicantModalOpen(false);
      setLetterModalOpen(true);
    },
    [results],
  );

  useEffect(() => {
    if (searchParams.get("checkout") === "success") {
      toast.success("You're in — Plott is live", {
        description:
          "Your subscription is active. Open the map, run a search, or open Settings to manage billing and seats.",
        duration: 10_000,
        className: "border-l-4 border-l-emerald-500 shadow-lg",
      });
      // Clean up URL without triggering navigation
      window.history.replaceState(null, "", "/app/dashboard");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!features.canPinApplications) return;
    let cancelled = false;
    async function loadPinnedApplications() {
      try {
        const res = await fetch("/api/pinned-applications");
        const data = (await res.json()) as {
          pinnedApplications?: PinnedApplicationRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Could not load pinned applications");
        if (cancelled) return;
        setPinnedApplications(
          Object.fromEntries(
            (data.pinnedApplications ?? []).map((p) => [
              pinnedKey(p.reference, p.councilId),
              p,
            ]),
          ),
        );
      } catch (err) {
        if (!cancelled) {
          console.warn("Failed to load pinned applications", err);
        }
      }
    }
    void loadPinnedApplications();
    return () => {
      cancelled = true;
    };
  }, [features.canPinApplications]);

  const togglePinnedApplication = useCallback(
    async (application: PlanningApplicationEntity) => {
      const key = pinnedKey(application.reference, application.councilId);
      if (!application.reference || pinPendingKey === key) return;

      const existing = pinnedApplications[key];
      setPinPendingKey(key);
      if (existing) {
        setPinnedApplications((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        try {
          const res = await fetch(`/api/pinned-applications/${existing.id}`, {
            method: "DELETE",
          });
          if (!res.ok) throw new Error("Could not unpin application");
          posthog.capture("application_unpinned", {
            reference: application.reference,
            planning_entity: application.entity ?? null,
          });
          toast.success("Application unpinned");
        } catch (err) {
          setPinnedApplications((prev) => ({ ...prev, [key]: existing }));
          toast.error("Could not unpin application", {
            description: err instanceof Error ? err.message : "Try again.",
          });
        } finally {
          setPinPendingKey(null);
        }
        return;
      }

      const optimistic: PinnedApplicationRow = {
        id: `optimistic-${key}`,
        reference: application.reference,
        councilId: application.councilId ?? null,
      };
      setPinnedApplications((prev) => ({ ...prev, [key]: optimistic }));
      try {
        const res = await fetch("/api/pinned-applications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reference: application.reference,
            councilId: application.councilId ?? null,
            planningEntity: application.entity ?? null,
            siteAddress: application["address-text"] ?? null,
            description: application.description ?? null,
            status: application["planning-application-status"] ?? null,
            decision: application["planning-decision-type"] ?? null,
            decisionDate: application["decision-date"] ?? null,
            sourceUrl: application.sourceUrl ?? null,
          }),
        });
        const data = (await res.json()) as {
          pinnedApplication?: PinnedApplicationRow;
          error?: string;
          upgrade?: boolean;
          limit?: number;
        };
        if (!res.ok) {
          if (data.upgrade) {
            throw new Error(
              data.limit && data.limit > 0
                ? `Your plan includes ${data.limit} pinned applications. Upgrade to track more.`
                : "Pinned applications require a paid plan.",
            );
          }
          throw new Error(data.error ?? "Could not pin application");
        }
        if (data.pinnedApplication) {
          setPinnedApplications((prev) => ({
            ...prev,
            [key]: data.pinnedApplication!,
          }));
        }
        posthog.capture("application_pinned", {
          reference: application.reference,
          planning_entity: application.entity ?? null,
          site_address: application["address-text"] ?? null,
        });
        toast.success("Application pinned. We'll email you when it changes.");
      } catch (err) {
        setPinnedApplications((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        toast.error("Could not pin application", {
          description: err instanceof Error ? err.message : "Try again.",
        });
      } finally {
        setPinPendingKey(null);
      }
    },
    [pinPendingKey, pinnedApplications],
  );

  const qaPinActions = useMemo(
    () => ({
      canPin: features.canPinApplications,
      isPinned: isPinnedApplication,
      onTogglePin: (row: PlanningApplicationEntity) => {
        void togglePinnedApplication(row);
      },
      pinPendingKey,
      pinKey: (row: PlanningApplicationEntity) =>
        pinnedKey(row.reference, row.councilId),
    }),
    [
      features.canPinApplications,
      isPinnedApplication,
      togglePinnedApplication,
      pinPendingKey,
    ],
  );

  const totalCount = meta?.count;
  const canNext = Boolean(meta?.links?.next);
  const canPrev =
    offset > 0 || Boolean(meta?.links?.prev);
  const visibleResults = useMemo(() => {
    const pinnedFirst = results
      .map((row, index) => ({ row, index, pinned: isPinnedApplication(row) }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return a.index - b.index;
      });

    return pinnedFirst
      .filter((item) => !showTrackedOnly || item.pinned)
      .map((item) => item.row);
  }, [isPinnedApplication, results, showTrackedOnly]);
  const trackedResultCount = results.reduce(
    (count, row) => count + (isPinnedApplication(row) ? 1 : 0),
    0,
  );

  useEffect(() => {
    resultsListRef.current?.scrollTo({ top: 0 });
  }, [offset, showTrackedOnly, trackedResultCount]);

  const runSearch = useCallback(
    async (
      bounds: Bounds,
      nextOffset: number,
      opts?: {
        pageLimit?: number;
        filterSnapshot?: RunSearchFilterSnapshot;
      },
    ): Promise<PlanningSearchResponse | null> => {
      const pageLimit = opts?.pageLimit ?? PAGE_SIZE;
      const f: RunSearchFilterSnapshot =
        opts?.filterSnapshot ?? {
        indexedSinceYear,
        developmentTypes,
        applicationTypes,
        statuses,
        decisionFrom,
        decisionTo,
      };
      setSearching(true);
      setError(null);
      setLastBounds(bounds);
      try {
        const params = new URLSearchParams({
          west: String(bounds.west),
          south: String(bounds.south),
          east: String(bounds.east),
          north: String(bounds.north),
          limit: String(pageLimit),
          offset: String(nextOffset),
        });
        if (
          f.indexedSinceYear.trim() !== "" &&
          !Number.isNaN(Number(f.indexedSinceYear))
        ) {
          const y = f.indexedSinceYear.trim();
          params.set("entry_date_year", y);
          params.set("entry_date_month", "1");
          params.set("entry_date_day", "1");
          params.set("entry_date_match", "since");
        }
        for (const t of f.developmentTypes) params.append("development_type", t);
        for (const t of f.applicationTypes) params.append("application_type", t);
        for (const s of f.statuses) params.append("status", s);
        if (f.decisionFrom) params.set("decision_date_from", f.decisionFrom);
        if (f.decisionTo) params.set("decision_date_to", f.decisionTo);
        const res = await fetch(`/api/planning/search?${params.toString()}`);
        if (res.status === 429) {
          setError(null);
          toast.error(
            "A 429 error occurred — please try again later or contact support.",
          );
          return null;
        }
        const data = (await res.json()) as PlanningSearchResponse & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "Search failed");
        }
        setResults(data.entities ?? []);
        setMeta(data);
        setOffset(nextOffset);
        return data;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
        toast.error("Failed to search map area", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
        return null;
      } finally {
        setSearching(false);
      }
    },
    [
      indexedSinceYear,
      developmentTypes,
      applicationTypes,
      statuses,
      decisionFrom,
      decisionTo,
    ],
  );

  const onSearchArea = useCallback(
    (bounds: Bounds) => {
      void runSearch(bounds, 0);
    },
    [runSearch],
  );

  /**
   * Tag / date / chip changes that are explicitly marked by the user re-run
   * the same streaming `/api/ai/deep-search` path as the NL bar, with
   * pre-parsed `filters` (no extra LLM).
   */
  useEffect(() => {
    if (manualFilterDeepSearchTimerRef.current) {
      clearTimeout(manualFilterDeepSearchTimerRef.current);
      manualFilterDeepSearchTimerRef.current = null;
    }
    if (!lastBounds) return;
    if (suppressManualFilterDeepSearchRef.current) return;
    if (!manualFiltersDirtyRef.current) return;
    manualFilterDeepSearchTimerRef.current = setTimeout(() => {
      manualFilterDeepSearchTimerRef.current = null;
      void runManualFilterDeepSearch();
    }, 350);
    return () => {
      if (manualFilterDeepSearchTimerRef.current) {
        clearTimeout(manualFilterDeepSearchTimerRef.current);
        manualFilterDeepSearchTimerRef.current = null;
      }
    };
  }, [
    lastBounds,
    indexedSinceYear,
    developmentTypes,
    applicationTypes,
    statuses,
    decisionFrom,
    decisionTo,
    nlLocationHint,
    nlApplicantLike,
    nlKeywords,
    runManualFilterDeepSearch,
  ]);

  /**
   * PlanWire bbox search when filters change and the user is not in the
   * tag-driven deep-search path (e.g. after "Search this area" on the map).
   * `pending` is checked before `streamInFlight` so an NL `apply` always
   * consumes a skip even while the stream is still in flight, avoiding a stuck
   * ref (see product plan: manual tags + deep-search).
   */
  useEffect(() => {
    if (!lastBounds) return;
    if (pendingNlEffectsRef.current > 0) {
      pendingNlEffectsRef.current -= 1;
      return;
    }
    if (streamInFlightRef.current > 0) return;
    if (manualFiltersDirtyRef.current) return;
    void runSearch(lastBounds, 0);
  }, [
    lastBounds,
    indexedSinceYear,
    developmentTypes,
    applicationTypes,
    statuses,
    decisionFrom,
    decisionTo,
    runSearch,
  ]);

  const nextOffset = useMemo(() => offset + PAGE_SIZE, [offset]);

  const handleNextPage = useCallback(() => {
    if (!lastBounds) return;
    void runSearch(lastBounds, nextOffset);
  }, [lastBounds, nextOffset, runSearch]);

  const handlePrevPage = useCallback(() => {
    if (!lastBounds) return;
    void runSearch(lastBounds, Math.max(0, offset - PAGE_SIZE));
  }, [lastBounds, offset, runSearch]);

  // -------------------------------------------------------------------------
  // Server-side persistence of the last search state.
  //
  // Writes are debounced (300ms) and fire-and-forget: a failure to persist
  // never surfaces to the user — the search UI is still fully functional
  // without it. Reads happen once on mount; hydration is silent and
  // non-destructive (bad shapes are ignored rather than throwing).
  //
  // Two flush paths ensure state survives navigation even mid-debounce:
  //   1. Unmount effect fires `fetch({ keepalive: true })` synchronously so
  //      within-app navigation (`/app/letters` etc) doesn't lose the save.
  //   2. `pagehide` listener uses `navigator.sendBeacon` for tab close /
  //      hard refresh.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!hasHydratedRef.current) return; // don't persist the initial empty state
    if (!lastBounds) return; // nothing worth saving yet

    // Strip `entities` from meta before persisting. It's a duplicate of
    // `results` and inflates the payload ~2x for no UI benefit.
    const slimMeta: PersistedMeta | null = meta
      ? {
          count: meta.count,
          links: meta.links,
          rawCount: meta.rawCount,
        }
      : null;
    const payload: PersistedDashboardState = {
      bounds: lastBounds,
      filters: {
        indexedSinceYear,
        developmentTypes,
        applicationTypes,
        statuses,
        decisionFrom,
        decisionTo,
      },
      nl: {
        summary: nlSummary,
        locationHint: nlLocationHint,
        keywords: nlKeywords,
        applicantLike: nlApplicantLike,
      },
      offset,
      results,
      meta: slimMeta,
      savedAt: new Date().toISOString(),
    };
    // Always park the freshest snapshot in the ref so flush paths can find
    // it even if the debounced timer never gets a chance to fire.
    latestPayloadRef.current = payload;

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      const body = latestPayloadRef.current;
      if (!body) return;
      void fetch("/api/dashboard-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {
        /* best-effort */
      });
    }, 300);
    // NOTE: deliberately no cleanup here. The next re-run of this effect
    // (from a dep change) already cancels and reschedules the timer. We
    // don't want React's per-render cleanup to cancel pending saves when
    // the component unmounts — that flush is handled by the dedicated
    // unmount effect below.
  }, [
    lastBounds,
    results,
    meta,
    offset,
    indexedSinceYear,
    developmentTypes,
    applicationTypes,
    statuses,
    decisionFrom,
    decisionTo,
    nlSummary,
    nlLocationHint,
    nlKeywords,
    nlApplicantLike,
  ]);

  // Unmount flush — catches within-app navigation (e.g. clicking a sidebar
  // link) where the debounced timer would otherwise be cancelled before
  // firing. `fetch` with `keepalive: true` continues in the background even
  // after the component is torn down.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      const body = latestPayloadRef.current;
      if (!body) return;
      try {
        void fetch("/api/dashboard-state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* no-op */
      }
    };
  }, []);

  // Tab close / hard refresh flush. `pagehide` is the only reliable signal
  // across browsers (Safari in particular doesn't always fire `unload`).
  // `sendBeacon` is POST-only, so the API route accepts both POST and PUT.
  useEffect(() => {
    const flushOnHide = () => {
      const body = latestPayloadRef.current;
      if (!body) return;
      try {
        const blob = new Blob([JSON.stringify(body)], {
          type: "application/json",
        });
        navigator.sendBeacon?.("/api/dashboard-state", blob);
      } catch {
        /* no-op */
      }
    };
    window.addEventListener("pagehide", flushOnHide);
    return () => window.removeEventListener("pagehide", flushOnHide);
  }, []);

  // Restore on mount. Runs exactly once; hydrates the dashboard from the
  // saved blob and pans the map to the saved bounds. No background refetch:
  // the saved state is treated as authoritative until the user runs a new
  // search or explicitly clears it. This matches a "workspace" mental model
  // where returning to the tab brings you back exactly where you left off.
  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("savedSearch")
    ) {
      // Digest deep link: dedicated effect applies GET /api/saved-searches/:id
      hasHydratedRef.current = true;
      restoreAttemptedRef.current = true;
      return;
    }
    restoreAttemptedRef.current = true;
    // Mark hydration complete synchronously so the persist effect is live
    // immediately even if the user kicks off a search before the fetch below
    // resolves. The persist effect's `if (!lastBounds) return` check keeps
    // us from saving the empty initial state.
    hasHydratedRef.current = true;

    (async () => {
      let shouldClearSuppress = false;
      try {
        const res = await fetch("/api/dashboard-state", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          state: PersistedDashboardState | null;
        };
        const state = json.state;
        if (!state || !state.bounds) return;

        suppressManualFilterDeepSearchRef.current = true;
        shouldClearSuppress = true;

        // Hydrate order: bounds → filters → NL metadata → offset → results.
        // Setting filter state will trigger the filter-change useEffect which
        // would fire an unwanted runSearch; bump the skip-counter so that
        // effect turns into a no-op for this hydration pass.
        setLastBounds(state.bounds);
        if (state.filters) {
          pendingNlEffectsRef.current += 1;
          setIndexedSinceYear(state.filters.indexedSinceYear ?? "");
          setDevelopmentTypes(state.filters.developmentTypes ?? []);
          setApplicationTypes(state.filters.applicationTypes ?? []);
          setStatuses(state.filters.statuses ?? []);
          setDecisionFrom(state.filters.decisionFrom ?? "");
          setDecisionTo(state.filters.decisionTo ?? "");
        }
        if (state.nl) {
          setNlSummary(state.nl.summary ?? null);
          setNlLocationHint(state.nl.locationHint ?? null);
          setNlKeywords(state.nl.keywords ?? []);
          setNlApplicantLike(state.nl.applicantLike ?? null);
        }
        setOffset(state.offset ?? 0);
        const restoredResults = Array.isArray(state.results)
          ? state.results
          : [];
        setResults(restoredResults);
        if (state.meta) {
          // Rehydrate the full PlanningSearchResponse — `entities` was
          // stripped at persist time and is always === results.
          setMeta({ ...state.meta, entities: restoredResults });
        }

        // Pan the map to the saved area once the imperative handle is
        // available. The MapCanvas ref is set after its first render, so we
        // poll briefly to bridge the gap.
        const targetBounds = state.bounds;
        let tries = 0;
        const panInterval = setInterval(() => {
          if (mapRef.current) {
            mapRef.current.panAndZoomTo(targetBounds);
            clearInterval(panInterval);
            return;
          }
          if (++tries > 40) clearInterval(panInterval); // ~4s
        }, 100);
      } catch {
        /* unauthenticated or network error — silent; fall back to empty */
      } finally {
        if (shouldClearSuppress) {
          setTimeout(() => {
            suppressManualFilterDeepSearchRef.current = false;
          }, 600);
        }
      }
    })();
  }, []);

  // Open dashboard from email digest: apply saved search bbox + filters, run
  // search, optionally select a lead, then clear query params.
  useEffect(() => {
    const id = searchParams.get("savedSearch");
    if (!id) {
      digestProcessedSavedSearchIdRef.current = null;
      return;
    }
    if (digestProcessedSavedSearchIdRef.current === id) return;
    digestProcessedSavedSearchIdRef.current = id;

    const mapSavedFilters = (raw: unknown): RunSearchFilterSnapshot => {
      const f = (raw ?? {}) as Record<string, unknown>;
      const developmentTypes: string[] = Array.isArray(f.developmentTypes)
        ? f.developmentTypes.filter((x): x is string => typeof x === "string")
        : [];
      const applicationTypes: string[] = Array.isArray(f.applicationTypes)
        ? f.applicationTypes.filter((x): x is string => typeof x === "string")
        : [];
      const statuses: string[] = Array.isArray(f.statuses)
        ? f.statuses.filter((x): x is string => typeof x === "string")
        : [];
      const decisionFrom =
        typeof f.decisionFrom === "string" ? f.decisionFrom : "";
      const decisionTo = typeof f.decisionTo === "string" ? f.decisionTo : "";
      let indexedSinceYear = "";
      if (f.indexedSinceYear != null && String(f.indexedSinceYear).trim() !== "") {
        indexedSinceYear = String(f.indexedSinceYear).trim();
      }
      return {
        indexedSinceYear,
        developmentTypes,
        applicationTypes,
        statuses,
        decisionFrom,
        decisionTo,
      };
    };

    void (async () => {
      const entityParam = searchParams.get("entity");
      const entityTarget =
        entityParam != null && entityParam !== ""
          ? parseInt(entityParam, 10)
          : Number.NaN;

      try {
        const res = await fetch(
          `/api/saved-searches/${encodeURIComponent(id)}`,
        );
        if (!res.ok) {
          toast.error("Could not open this saved search from the link.");
          digestProcessedSavedSearchIdRef.current = null;
          window.history.replaceState(null, "", "/app/dashboard");
          return;
        }
        const payload = (await res.json()) as {
          search: { bbox: Bounds; filters: unknown; name: string };
        };
        const { search } = payload;
        const filterSnapshot = mapSavedFilters(search.filters);
        const rawBbox = search.bbox;
        if (
          !rawBbox ||
          [rawBbox.west, rawBbox.south, rawBbox.east, rawBbox.north].some(
            (n) => typeof n !== "number" || Number.isNaN(n),
          )
        ) {
          toast.error("Invalid saved search data.");
          digestProcessedSavedSearchIdRef.current = null;
          window.history.replaceState(null, "", "/app/dashboard");
          return;
        }

        const bbox = clampBboxToSearchable(rawBbox);
        if (
          bbox.west !== rawBbox.west ||
          bbox.south !== rawBbox.south ||
          bbox.east !== rawBbox.east ||
          bbox.north !== rawBbox.north
        ) {
          toast.info(
            "This saved map area was larger than a fast search allows. Showing results for the centre of that area — zoom in on the map if you need a tighter view.",
            { duration: 8000 },
          );
        }

        suppressManualFilterDeepSearchRef.current = true;

        setNlSummary(null);
        setNlLocationHint(null);
        setNlKeywords([]);
        setNlApplicantLike(null);
        setOffset(0);
        setSelectedEntityId(null);

        pendingNlEffectsRef.current += 1;
        setLastBounds(bbox);
        setIndexedSinceYear(filterSnapshot.indexedSinceYear);
        setDevelopmentTypes(filterSnapshot.developmentTypes);
        setApplicationTypes(filterSnapshot.applicationTypes);
        setStatuses(filterSnapshot.statuses);
        setDecisionFrom(filterSnapshot.decisionFrom);
        setDecisionTo(filterSnapshot.decisionTo);

        const data = await runSearch(bbox, 0, {
          pageLimit: 100,
          filterSnapshot,
        });
        if (!data) {
          digestProcessedSavedSearchIdRef.current = null;
          window.history.replaceState(null, "", "/app/dashboard");
          return;
        }
        const entities = data.entities ?? [];
        if (!Number.isNaN(entityTarget)) {
          const found = entities.some((r) => r.entity === entityTarget);
          if (found) {
            setSelectedEntityId(entityTarget);
          } else {
            toast.info(
              "We opened your search, but that application is not in the current results. Try adjusting filters or the map area.",
            );
          }
        }

        let tries = 0;
        const panInterval = setInterval(() => {
          if (mapRef.current) {
            mapRef.current.panAndZoomTo(bbox);
            clearInterval(panInterval);
            return;
          }
          if (++tries > 40) clearInterval(panInterval);
        }, 100);

        window.history.replaceState(null, "", "/app/dashboard");
        setTimeout(() => {
          suppressManualFilterDeepSearchRef.current = false;
        }, 600);
      } catch {
        toast.error("Could not open saved search from the link.");
        digestProcessedSavedSearchIdRef.current = null;
        window.history.replaceState(null, "", "/app/dashboard");
        suppressManualFilterDeepSearchRef.current = false;
      }
    })();
  }, [searchParams, runSearch]);

  // Legacy email links: ?entity= only (no savedSearch). Select if present in list.
  const legacyEntityLinkRef = useRef(false);
  useEffect(() => {
    if (legacyEntityLinkRef.current) return;
    if (searchParams.get("savedSearch")) return;
    const raw = searchParams.get("entity");
    if (raw == null || raw === "") return;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    if (results.length === 0) return;
    if (!results.some((r) => r.entity === n)) return;
    legacyEntityLinkRef.current = true;
    queueMicrotask(() => setSelectedEntityId(n));
    window.history.replaceState(null, "", "/app/dashboard");
  }, [searchParams, results]);

  const pageNum = Math.floor(offset / PAGE_SIZE) + 1;
  const showPagination =
    lastBounds != null &&
    (results.length > 0 || canPrev || canNext);
  const rowRangeLabel =
    results.length === 0
      ? "—"
      : `${offset + 1}–${offset + results.length}`;

  const openApplicantModal = (
    reference: string,
    organisationEntity: string | number | null,
    extra?: Partial<{
      planningEntity: number | null;
      siteAddress: string | null;
      description: string | null;
      applicationType: string | null;
      status: string | null;
      lpaName: string | null;
      postcode: string | null;
      point: string | null;
      seedApplicant: string | null;
      seedAgent: string | null;
      seedAgentAddress: string | null;
    }>,
  ) => {
    setSelectedApplicant({ reference, organisationEntity, ...(extra ?? {}) });
    setApplicantModalOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 items-stretch overflow-hidden bg-white">
      {/* Sidebar: header + pagination fixed; only the list region scrolls (prevents page scroll) */}
      <aside className="z-10 flex h-full min-h-0 w-96 shrink-0 flex-col overflow-hidden border-r border-zinc-200 bg-zinc-50 shadow-sm">
        <div className="shrink-0 border-b border-zinc-200 bg-zinc-50 p-4 pb-3">
          <p className="editorial-chapter-label mb-1 text-zinc-500">
            01 — Map
          </p>
          <div className="flex items-center justify-between mb-2">
            <h1 className="font-[family-name:var(--font-display)] text-[22px] font-normal leading-none tracking-tight text-zinc-950">
              Explore
            </h1>
            <button
              type="button"
              aria-label={filtersOpen ? "Close filters" : "Open filters"}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(!filtersOpen)}
              className={cn(
                "p-2 rounded-md hover:bg-zinc-200 transition-colors text-zinc-600",
                filtersOpen && "bg-zinc-200 text-zinc-900"
              )}
            >
              <Settings2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
          
          <AnimatePresence>
            {filtersOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2 pb-4 space-y-3">
                  <FilterMulti
                    label="Status"
                    values={statuses}
                    onChange={(v) => {
                      markManualFilterChange();
                      setStatuses(v);
                    }}
                    options={[
                      "approved",
                      "granted",
                      "refused",
                      "withdrawn",
                      "pending",
                    ]}
                  />
                  <FilterMulti
                    label="Application type"
                    values={applicationTypes}
                    onChange={(v) => {
                      markManualFilterChange();
                      setApplicationTypes(v);
                    }}
                    options={[
                      "full",
                      "outline",
                      "reserved matters",
                      "householder",
                      "listed building",
                      "prior approval",
                    ]}
                  />
                  <FilterMulti
                    label="Development type"
                    values={developmentTypes}
                    onChange={(v) => {
                      markManualFilterChange();
                      setDevelopmentTypes(v);
                    }}
                    options={[
                      "residential",
                      "commercial",
                      "change of use",
                      "extension",
                      "new build",
                      "mixed use",
                    ]}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-zinc-600">
                      Decision from
                      <input
                        type="date"
                        value={decisionFrom}
                        onChange={(e) => {
                          markManualFilterChange();
                          setDecisionFrom(e.target.value);
                        }}
                        className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs"
                      />
                    </label>
                    <label className="text-xs text-zinc-600">
                      Decision to
                      <input
                        type="date"
                        value={decisionTo}
                        onChange={(e) => {
                          markManualFilterChange();
                          setDecisionTo(e.target.value);
                        }}
                        className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs"
                      />
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-2">
            <NlSearchBar
              onParsed={applyNlFilters}
              onViewport={handleDeepSearchViewport}
              onResults={handleDeepSearchResults}
              onStreamStart={handleStreamStart}
              onStreamEnd={handleStreamEnd}
              getCurrentBounds={getCurrentBounds}
              chips={nlChips}
            />
            {nlSummary && (
              <p className="mt-1 text-[11px] text-zinc-500 italic">
                {nlSummary}
              </p>
            )}
          </div>

          {error ? (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-zinc-500 font-medium">
              {searching ? (
                "Searching..."
              ) : showTrackedOnly && results.length > 0 ? (
                `${visibleResults.length} tracked · ${results.length} in these results`
              ) : totalCount != null ? (
                `${totalCount.toLocaleString()} total · showing ${offset + 1}–${offset + results.length}`
              ) : results.length ? (
                `Showing ${results.length}`
              ) : (
                "No results"
              )}
            </p>
            <div className="flex items-center gap-2">
              {features.canPinApplications && results.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowTrackedOnly((value) => !value)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium transition-colors",
                    showTrackedOnly
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                  )}
                  aria-pressed={showTrackedOnly}
                >
                  <RadioTower className="h-3 w-3" />
                  <span className="text-[10px] text-current/60">
                    {trackedResultCount}
                  </span>
                </button>
              )}
              {lastBounds && features.canSaveSearches && (
                <button
                  type="button"
                  onClick={() => {
                    setSaveSearchName("");
                    setSaveSearchOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  <Bookmark className="h-3 w-3" />
                </button>
              )}
              {results.length > 0 && features.canExportCsv && (
                <button
                  onClick={() => {
                    downloadCsv(results);
                    posthog.capture("csv_exported", { count: results.length });
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  <Download className="h-3 w-3" /> Export
                </button>
              )}
              {lastBounds && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Only this region scrolls — keeps app header + map + sidebar chrome fixed */}
        <div
          ref={resultsListRef}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable]"
        >
          {searching && !results.length ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-zinc-200 bg-white shadow-sm"
                style={{
                  opacity: 1 - i * 0.1,
                }}
              >
                <SkeletonCard />
              </div>
            ))
          ) : visibleResults.length > 0 ? (
            <>
              {visibleResults.map((r, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.4,
                    delay: Math.min(i * 0.03, 0.4),
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  key={r.entity}
                  onClick={() => setSelectedEntityId(r.entity)}
                  className={cn(
                    "group cursor-pointer rounded-lg border p-4 shadow-sm transition-all hover:border-zinc-400 bg-white",
                    selectedEntityId === r.entity 
                      ? "border-blue-500 bg-blue-50/50" 
                      : "border-zinc-200"
                  )}
                >
                  <div className="mb-2 flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <span className="max-w-full truncate rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs font-medium text-zinc-700">
                      {r.reference ?? "No Ref"}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5">
                      {features.canPinApplications && isPinnedApplication(r) ? (
                        <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                          <span className="relative flex h-3 w-3 items-center justify-center">
                            <TrackingPulse />
                            <RadioTower className="relative h-3 w-3" />
                          </span>
                        </span>
                      ) : null}
                      <span className={cn(
                        "max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                        (r["planning-decision-type"] || r["planning-application-status"])?.toLowerCase().includes("approve") ||
                        (r["planning-decision-type"] || r["planning-application-status"])?.toLowerCase().includes("granted")
                          ? "bg-green-100 text-green-700"
                          : (r["planning-decision-type"] || r["planning-application-status"])?.toLowerCase().includes("refuse") ||
                            (r["planning-decision-type"] || r["planning-application-status"])?.toLowerCase().includes("rejected")
                          ? "bg-red-100 text-red-700"
                          : "bg-zinc-100 text-zinc-700"
                      )}>
                        {r["planning-decision-type"] || r["planning-application-status"] || "Unknown"}
                      </span>
                    </div>
                  </div>
                  
                  <p className="text-sm font-medium leading-snug line-clamp-2 mb-3 text-zinc-900">
                    {r.description ?? "No description available"}
                  </p>

                  <div className="space-y-1.5 text-xs text-zinc-500">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{r["address-text"] ?? "—"}</span>
                    </div>
                    {r["decision-date"] && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>Decision: {r["decision-date"]}</span>
                      </div>
                    )}
                    {(r.enrichment?.applicantName || r.enrichment?.agentName) && (
                      <div className="flex items-start gap-2 text-zinc-700">
                        <UserCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
                        <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {r.enrichment.applicantName ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleApplicantLikeFromTag(
                                  r.enrichment!.applicantName!,
                                );
                              }}
                              className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
                              title={`Filter by "${r.enrichment.applicantName}"`}
                            >
                              <span className="text-emerald-700/80">
                                Applicant:
                              </span>
                              <span className="truncate">
                                {r.enrichment.applicantName}
                              </span>
                            </button>
                          ) : null}
                          {r.enrichment.agentName ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleApplicantLikeFromTag(r.enrichment!.agentName!);
                              }}
                              className="inline-flex max-w-full items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[11px] font-medium text-cyan-800 transition-colors hover:bg-cyan-100"
                              title={`Filter by "${r.enrichment.agentName}"`}
                            >
                              <span className="text-cyan-700/80">Agent:</span>
                              <span className="truncate">
                                {r.enrichment.agentName}
                              </span>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between">
                    {r.councilId ? (
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Building className="h-3 w-3" /> LPA {r.councilId}
                      </span>
                    ) : (
                      <span />
                    )}
                    {r.sourceUrl ? (
                      // <a
                      //   href={r.sourceUrl}
                      //   target="_blank"
                      //   rel="noreferrer"
                      //   className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      //   onClick={(e) => e.stopPropagation()}
                      // >
                      //   Record <ExternalLink className="h-3 w-3" />
                      // </a>
                      null
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    {r.reference && features.canPinApplications ? (
                      <button
                        type="button"
                        disabled={pinPendingKey === pinnedKey(r.reference, r.councilId)}
                        onClick={(e) => {
                          e.stopPropagation();
                          void togglePinnedApplication(r);
                        }}
                        className={cn(
                          "relative w-full overflow-hidden rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-70",
                          isPinnedApplication(r)
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
                        )}
                      >
                        <span className="flex items-center justify-center gap-2">
                          <span className="relative flex h-4 w-4 items-center justify-center">
                            {isPinnedApplication(r) ? (
                              <>
                                <TrackingPulse />
                                <RadioTower className="relative h-3.5 w-3.5" />
                              </>
                            ) : (
                              <Pin className="h-3.5 w-3.5" />
                            )}
                          </span>
                          {isPinnedApplication(r) ? "Tracking" : "Pin application"}
                        </span>
                      </button>
                    ) : null}
                    {r.reference ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openApplicantModal(
                            r.reference!,
                            r["organisation-entity"] ?? null,
                            {
                              planningEntity: r.entity ?? null,
                              siteAddress: r["address-text"] ?? null,
                              description: r.description ?? null,
                              applicationType:
                                r["planning-application-type"] ?? null,
                              status: r["planning-application-status"] ?? null,
                              postcode: r.postcode ?? null,
                              point: r.point ?? null,
                              seedApplicant: r.enrichment?.applicantName ?? null,
                              seedAgent: r.enrichment?.agentName ?? null,
                              seedAgentAddress:
                                r.enrichment?.agentAddress ?? null,
                            },
                          );
                        }}
                        className="w-full flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
                      >
                        <User className="h-3.5 w-3.5" />
                        View Applicant
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLetterApplication(r);
                        setPendingLetterContact(null);
                        setLetterModalOpen(true);
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Proprietor & letter
                    </button>
                  </div>
                </motion.div>
              ))}
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white">
                <Search className="h-5 w-5 text-zinc-400" strokeWidth={1.5} />
              </div>
              <p className="editorial-chapter-label text-zinc-400">Empty plott</p>
              <p className="mt-3 font-[family-name:var(--font-display)] text-[22px] font-normal leading-tight tracking-tight text-zinc-950">
                {showTrackedOnly && results.length > 0
                  ? "No tracked applications here."
                  : lastBounds
                    ? "Nothing here yet."
                    : "Draw the plott."}
              </p>
              <p className="mt-2 max-w-[22ch] text-[13px] leading-relaxed text-zinc-500">
                {showTrackedOnly && results.length > 0
                  ? "Turn off Tracked only to see all results in this search."
                  : lastBounds
                    ? "Try panning the map or clearing the since-year chip below."
                    : "Pan and zoom the map, then search to surface applications."}
              </p>
            </div>
          )}
        </div>

        {showPagination ? (
          <div className="shrink-0 border-t border-zinc-200 bg-zinc-50 px-4 py-3 shadow-[0_-4px_14px_-2px_rgba(0,0,0,0.06)]">
            <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.22em] leading-snug text-zinc-500">
              <span className="text-zinc-700">Page {pageNum}</span>
              <span className="mx-2 text-zinc-300">/</span>
              <span>rows {rowRangeLabel}</span>
              {totalCount != null ? (
                <span className="text-zinc-400"> of {totalCount.toLocaleString()}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={searching || !canPrev}
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={searching || !canNext}
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      {/* Map: fills remaining width; does not scroll with the list */}
      <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-100">
        <MapCanvas
          ref={mapRef}
          results={results}
          onSearchArea={onSearchArea}
          searching={searching}
          selectedEntityId={selectedEntityId}
          onSelectEntity={setSelectedEntityId}
          onTagFilter={toggleApplicantLikeFromTag}
        />
      </div>

      <ApplicantModal
        isOpen={applicantModalOpen}
        onClose={() => setApplicantModalOpen(false)}
        reference={selectedApplicant?.reference ?? null}
        organisationEntity={selectedApplicant?.organisationEntity ?? null}
        planningEntity={selectedApplicant?.planningEntity ?? null}
        siteAddress={selectedApplicant?.siteAddress ?? null}
        description={selectedApplicant?.description ?? null}
        applicationType={selectedApplicant?.applicationType ?? null}
        status={selectedApplicant?.status ?? null}
        lpaName={selectedApplicant?.lpaName ?? null}
        postcode={selectedApplicant?.postcode ?? null}
        point={selectedApplicant?.point ?? null}
        seedApplicant={selectedApplicant?.seedApplicant ?? null}
        seedAgent={selectedApplicant?.seedAgent ?? null}
        seedAgentAddress={selectedApplicant?.seedAgentAddress ?? null}
        onDraftLetter={handleApplicantDraftLetter}
        onViewApplicant={handleQaViewApplicant}
        onSearchResults={handleQaSearchResults}
        pinActions={qaPinActions}
      />

      <ProprietorLetterModal
        key={letterApplication?.entity ?? "none"}
        application={letterApplication}
        isOpen={letterModalOpen}
        initialContact={pendingLetterContact}
        onClose={() => {
          setLetterModalOpen(false);
          setLetterApplication(null);
          setPendingLetterContact(null);
        }}
      />

      <Dialog
        open={saveSearchOpen}
        onOpenChange={(open) => {
          if (!saveSearchPending) setSaveSearchOpen(open);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save search</DialogTitle>
            <DialogDescription>
              Give this search a name. We&apos;ll monitor the area and send you
              weekly digests when new applications appear.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!saveSearchName.trim() || !lastBounds) return;
              setSaveSearchPending(true);
              try {
                const res = await fetch("/api/saved-searches", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: saveSearchName.trim(),
                    bbox: lastBounds,
                    filters: {
                      developmentTypes,
                      applicationTypes,
                      statuses,
                      decisionFrom,
                      decisionTo,
                      indexedSinceYear:
                        indexedSinceYear.trim() !== "" &&
                        !Number.isNaN(Number(indexedSinceYear))
                          ? indexedSinceYear.trim()
                          : null,
                    },
                    frequency: "weekly",
                  }),
                });
                if (res.ok) {
                  setSaveSearchOpen(false);
                  posthog.capture("search_saved", {
                    name: saveSearchName.trim(),
                    has_filters:
                      developmentTypes.length > 0 ||
                      applicationTypes.length > 0 ||
                      statuses.length > 0 ||
                      Boolean(decisionFrom) ||
                      Boolean(decisionTo),
                  });
                  toast.success("Search saved. We'll send weekly digests.");
                } else {
                  const data = await res.json().catch(() => ({}));
                  setSaveSearchOpen(false);
                  if (data.upgrade) {
                    toast.error(data.error ?? "Saved search limit reached", {
                      action: {
                        label: "Upgrade to Agency",
                        onClick: () => (window.location.href = "/pricing"),
                      },
                    });
                  } else {
                    toast.error(data.error ?? "Could not save this search");
                  }
                }
              } finally {
                setSaveSearchPending(false);
              }
            }}
            className="space-y-4"
          >
            <input
              autoFocus
              type="text"
              placeholder="e.g. Camden refusals"
              value={saveSearchName}
              onChange={(e) => setSaveSearchName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
            <DialogFooter>
              <button
                type="button"
                onClick={() => setSaveSearchOpen(false)}
                disabled={saveSearchPending}
                className="rounded-full border border-zinc-200 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!saveSearchName.trim() || saveSearchPending}
                className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {saveSearchPending ? "Saving…" : "Save search"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
