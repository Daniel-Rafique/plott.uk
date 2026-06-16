"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConfidenceLevel = "low" | "medium" | "high";

type ConfidenceContext = "enrichment" | "research";

function confidenceExplanation(
  confidence: ConfidenceLevel,
  context: ConfidenceContext,
): string {
  if (context === "research") {
    if (confidence === "high") {
      return "High confidence means the briefing strongly appears to match the right person or organisation.";
    }
    if (confidence === "medium") {
      return "Medium confidence means the briefing has useful matches, but some details may need checking.";
    }
    return "Low confidence means the briefing is based on sparse or uncertain matches. Review before relying on it.";
  }

  if (confidence === "high") {
    return "High confidence means Plott found strong matching identity and address evidence for this contact.";
  }
  if (confidence === "medium") {
    return "Medium confidence means Plott found partial but useful evidence for this contact.";
  }
  return "Low confidence means the contact match is sparse or uncertain. Review before sending outreach.";
}

export function ConfidenceTooltip({
  confidence,
  context = "enrichment",
  label,
  className,
}: {
  confidence: ConfidenceLevel;
  context?: ConfidenceContext;
  label?: string;
  className?: string;
}) {
  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            tabIndex={0}
            className={cn(
              "inline-flex cursor-help items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2",
              className,
            )}
          >
            {label ?? `${confidence} confidence`}
            <Info className="h-3 w-3 opacity-60" aria-hidden />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={6}
            className="z-50 max-w-xs rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-700 shadow-lg"
          >
            {confidenceExplanation(confidence, context)}
            <Tooltip.Arrow className="fill-white" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
