"use client";

/**
 * Collapsible left Explore drawer — filters, result chrome, and list.
 * Overlays the map (does not permanently steal width). Spring motion follows
 * Apple drawer defaults (slight bounce, ~0.3s response); reduced-motion uses
 * a cross-fade instead of a slide.
 */

import type { ReactNode, RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NlFilterChip } from "./nl-search-bar";

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

export type ExploreDrawerProps = {
  open: boolean;
  onClose: () => void;
  filtersOpen: boolean;
  onToggleFilters: () => void;
  statuses: string[];
  onStatusesChange: (v: string[]) => void;
  applicationTypes: string[];
  onApplicationTypesChange: (v: string[]) => void;
  developmentTypes: string[];
  onDevelopmentTypesChange: (v: string[]) => void;
  decisionFrom: string;
  decisionTo: string;
  onDecisionFromChange: (v: string) => void;
  onDecisionToChange: (v: string) => void;
  markManualFilterChange: () => void;
  chips: NlFilterChip[];
  nlSummary: string | null;
  error: string | null;
  countLabel: ReactNode;
  toolbar: ReactNode;
  listRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  pagination?: ReactNode;
};

export function ExploreDrawer({
  open,
  onClose,
  filtersOpen,
  onToggleFilters,
  statuses,
  onStatusesChange,
  applicationTypes,
  onApplicationTypesChange,
  developmentTypes,
  onDevelopmentTypesChange,
  decisionFrom,
  decisionTo,
  onDecisionFromChange,
  onDecisionToChange,
  markManualFilterChange,
  chips,
  nlSummary,
  error,
  countLabel,
  toolbar,
  listRef,
  children,
  pagination,
}: ExploreDrawerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            key="explore-scrim"
            aria-label="Close Explore"
            className="absolute inset-0 z-20 bg-zinc-950/15 motion-reduce:bg-zinc-950/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.25 }}
            onClick={onClose}
          />
          <motion.aside
            key="explore-panel"
            role="dialog"
            aria-label="Explore results"
            className={cn(
              "absolute left-0 top-0 z-30 flex h-full min-h-0 w-96 max-w-[min(100%,24rem)] flex-col overflow-hidden border-r border-zinc-200/80 shadow-[8px_0_24px_-12px_rgba(0,0,0,0.18)]",
              "bg-zinc-50/90 backdrop-blur-xl backdrop-saturate-150",
              "supports-[backdrop-filter]:bg-zinc-50/75",
              "motion-reduce:bg-zinc-50 motion-reduce:backdrop-filter-none",
            )}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { x: "-100%", opacity: 1 }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { x: 0, opacity: 1 }
            }
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { x: "-100%", opacity: 1 }
            }
            transition={
              reduceMotion
                ? { duration: 0.2 }
                : { type: "spring", bounce: 0.2, duration: 0.3 }
            }
          >
            <div className="shrink-0 border-b border-zinc-200/80 p-4 pb-3">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="editorial-chapter-label mb-1 text-zinc-500">
                    01 — Map
                  </p>
                  <h1 className="font-[family-name:var(--font-display)] text-[22px] font-normal leading-none tracking-tight text-zinc-950">
                    Explore
                  </h1>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={filtersOpen ? "Close filters" : "Open filters"}
                    aria-expanded={filtersOpen}
                    onClick={onToggleFilters}
                    className={cn(
                      "rounded-md p-2 text-zinc-600 transition-colors hover:bg-zinc-200/80",
                      filtersOpen && "bg-zinc-200 text-zinc-900",
                    )}
                  >
                    <Settings2 className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Close Explore"
                    onClick={onClose}
                    className="rounded-md p-2 text-zinc-600 transition-colors hover:bg-zinc-200/80"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {filtersOpen && (
                  <motion.div
                    initial={
                      reduceMotion
                        ? { opacity: 0 }
                        : { height: 0, opacity: 0 }
                    }
                    animate={
                      reduceMotion
                        ? { opacity: 1 }
                        : { height: "auto", opacity: 1 }
                    }
                    exit={
                      reduceMotion
                        ? { opacity: 0 }
                        : { height: 0, opacity: 0 }
                    }
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pb-4 pt-2">
                      <FilterMulti
                        label="Status"
                        values={statuses}
                        onChange={(v) => {
                          markManualFilterChange();
                          onStatusesChange(v);
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
                          onApplicationTypesChange(v);
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
                          onDevelopmentTypesChange(v);
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
                              onDecisionFromChange(e.target.value);
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
                              onDecisionToChange(e.target.value);
                            }}
                            className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs"
                          />
                        </label>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {chips.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {chips.map((chip, i) => (
                    <button
                      key={`${chip.label}-${i}`}
                      type="button"
                      onClick={chip.onRemove}
                      className="group inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
                      title={`Remove "${chip.label}"`}
                    >
                      {chip.label}
                      <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                    </button>
                  ))}
                </div>
              ) : null}

              {nlSummary ? (
                <p className="mt-1 text-[11px] italic text-zinc-500">
                  {nlSummary}
                </p>
              ) : null}

              {error ? (
                <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
                  {error}
                </p>
              ) : null}

              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-500">{countLabel}</p>
                <div className="flex items-center gap-2">{toolbar}</div>
              </div>
            </div>

            <div
              ref={listRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 [scrollbar-gutter:stable]"
            >
              {children}
            </div>

            {pagination ? (
              <div className="shrink-0 border-t border-zinc-200/80 bg-zinc-50/90 px-4 py-3 shadow-[0_-4px_14px_-2px_rgba(0,0,0,0.06)]">
                {pagination}
              </div>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
