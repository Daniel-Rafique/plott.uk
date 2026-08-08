"use client";

import type { ReactNode, RefObject } from "react";
import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "@/components/markdown-message";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import { ResultBubble } from "./result-bubble";
import { StreamingWaveform } from "./streaming";
import type { AgentChatMessage, QaResultPinActions } from "./types";

export function AgentMessageList({
  messages,
  streaming,
  error,
  empty,
  pinActions,
  onViewApplicant,
  className,
  scrollRef,
}: {
  messages: AgentChatMessage[];
  streaming: boolean;
  error?: string | null;
  empty?: ReactNode;
  pinActions?: QaResultPinActions;
  onViewApplicant?: (row: PlanningApplicationEntity) => void;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={scrollRef}
      className={cn(
        "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3",
        className,
      )}
      aria-live="polite"
    >
      {messages.length === 0 ? (
        empty
      ) : (
        messages.map((m, i) => (
          <div key={i} className="space-y-2">
            <div
              className={cn(
                "flex gap-2",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {m.role === "assistant" ? (
                <div className="mt-0.5 rounded-full bg-zinc-100 p-1">
                  <Bot className="h-3 w-3 text-zinc-700" aria-hidden />
                </div>
              ) : null}
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-snug transition-shadow duration-300",
                  m.role === "user"
                    ? "whitespace-pre-wrap bg-zinc-900 text-white"
                    : "bg-zinc-50 text-zinc-800",
                  m.role === "assistant" && !m.content && streaming
                    ? "ring-1 ring-zinc-200 shadow-[0_0_12px_rgba(24,24,27,0.08)]"
                    : "",
                )}
              >
                {m.content ? (
                  m.role === "assistant" ? (
                    <MarkdownMessage content={m.content} />
                  ) : (
                    m.content
                  )
                ) : (
                  <span className="inline-flex items-center gap-2 py-1">
                    <StreamingWaveform />
                    <span className="text-[11px] font-medium tracking-wide text-zinc-400">
                      {m.statusLine || "thinking"}
                    </span>
                  </span>
                )}
              </div>
              {m.role === "user" ? (
                <div className="mt-0.5 rounded-full bg-zinc-800 p-1">
                  <User className="h-3 w-3 text-white" aria-hidden />
                </div>
              ) : null}
            </div>

            {m.role === "assistant" && m.results?.length ? (
              <div className="ml-8 space-y-1.5">
                {m.results.slice(0, 8).map((row) => (
                  <ResultBubble
                    key={row.entity}
                    row={row}
                    pinActions={pinActions}
                    onClick={
                      onViewApplicant
                        ? () => onViewApplicant(row)
                        : undefined
                    }
                  />
                ))}
                {m.results.length > 8 ? (
                  <p className="text-[11px] text-zinc-500">
                    +{m.results.length - 8} more in Explore
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ))
      )}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
