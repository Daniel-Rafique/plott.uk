"use client";

import { ArrowRight, MapPin, Pin, RadioTower } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import type { QaResultPinActions } from "./types";

function statusPillClass(label: string | undefined): string {
  const l = (label ?? "").toLowerCase();
  if (l.includes("approve") || l.includes("grant")) {
    return "bg-green-100 text-green-700";
  }
  if (l.includes("refuse") || l.includes("reject")) {
    return "bg-red-100 text-red-700";
  }
  return "bg-zinc-100 text-zinc-600";
}

/** Compact, chat-native result card. Whole card is tappable to open the case. */
export function ResultBubble({
  row,
  onClick,
  pinActions,
}: {
  row: PlanningApplicationEntity;
  onClick?: () => void;
  pinActions?: QaResultPinActions;
}) {
  const status =
    row["planning-decision-type"] || row["planning-application-status"];
  const address = row["address-text"];
  const pinned = pinActions?.isPinned(row) ?? false;
  const pinPending =
    pinActions != null &&
    pinActions.pinPendingKey === pinActions.pinKey(row);
  const showPin = Boolean(pinActions?.canPin && row.reference);

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white transition-colors hover:border-zinc-400 focus-within:ring-1 focus-within:ring-zinc-400">
      <button
        type="button"
        onClick={onClick}
        className="group w-full px-3 py-2 text-left transition-colors hover:bg-zinc-50 focus:outline-none"
      >
        <p className="line-clamp-2 text-xs font-medium leading-snug text-zinc-900">
          {row.description || "No description available"}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500">
          {status ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 font-semibold uppercase tracking-wide",
                statusPillClass(status),
              )}
            >
              {status}
            </span>
          ) : null}
          {address ? (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{address}</span>
            </span>
          ) : null}
          <ArrowRight
            className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-600"
            aria-hidden
          />
        </div>
      </button>
      {showPin && pinActions ? (
        <div className="border-t border-zinc-100 px-2 py-1.5">
          <button
            type="button"
            disabled={pinPending}
            onClick={(e) => {
              e.stopPropagation();
              void pinActions.onTogglePin(row);
            }}
            className={cn(
              "relative w-full overflow-hidden rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-70",
              pinned
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50",
            )}
          >
            <span className="flex items-center justify-center gap-1.5">
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                {pinned ? (
                  <>
                    <span
                      className="absolute inset-0 animate-ping rounded-full border border-emerald-400/70 bg-emerald-400/15"
                      aria-hidden
                    />
                    <RadioTower className="relative h-3 w-3" aria-hidden />
                  </>
                ) : (
                  <Pin className="h-3 w-3" aria-hidden />
                )}
              </span>
              {pinned ? "Tracking" : "Pin application"}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
