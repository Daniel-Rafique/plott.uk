"use client";

/**
 * Planning Q&A chatbot panel.
 *
 * Drop into any view where an application is in focus. Streams answers from
 * `/api/ai/chat` and renders them live. The panel is stateless between mounts
 * — close + reopen resets the conversation, which is deliberate (each case
 * should start fresh to avoid cross-contamination between applications).
 *
 * Shared chrome lives in `@/components/agent-chat`; this file wires modal-scoped
 * chat behaviour around that shell.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import {
  AgentComposer,
  AgentMessageList,
  StreamingSparkle,
  useChatStream,
  type AgentChatMessage,
  type PlanningQaContext,
  type QaResultPinActions,
} from "@/components/agent-chat";

export type { PlanningQaContext, QaResultPinActions };

const SUGGESTIONS = [
  "Summarise this application in plain English.",
  "What stage is this at and what happens next?",
  "Who is the applicant and are they a company?",
  "Other recent applications in this council",
  "Refused applications nearby",
];

export function PlanningQaPanel({
  application,
  className,
  onViewApplicant,
  onResults,
  pinActions,
}: {
  application?: PlanningQaContext;
  className?: string;
  /** Open a result in the modal (re-seeds the focused case). */
  onViewApplicant?: (row: PlanningApplicationEntity) => void;
  /** Fired when a search returns results, so the host can sync map/sidebar. */
  onResults?: (entities: PlanningApplicationEntity[]) => void;
  /** Pin / tracking controls — same behaviour as the dashboard sidebar. */
  pinActions?: QaResultPinActions;
}) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { streaming, error, sendChat, stop } = useChatStream({ onResults });

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      const next: AgentChatMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      setMessages(next);
      setInput("");
      await sendChat(next, application, setMessages);
    },
    [messages, streaming, application, sendChat],
  );

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white",
        className,
      )}
    >
      <header className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <Sparkles
            className={cn(
              "h-4 w-4 transition-colors duration-300",
              streaming ? "text-zinc-500" : "text-zinc-700",
            )}
            aria-hidden
          />
          <p className="text-sm font-semibold text-zinc-900">
            Research assistant
          </p>
          {streaming && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
              <StreamingSparkle />
              Generating
            </span>
          )}
        </div>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
          AI
        </span>
      </header>

      <AgentMessageList
        messages={messages}
        streaming={streaming}
        error={error}
        pinActions={pinActions}
        onViewApplicant={onViewApplicant}
        scrollRef={scrollRef}
        empty={
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              Ask about this case or search planning data — the assistant can
              look up records, council data, applicant details, and find other
              applications.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-800 hover:bg-zinc-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <AgentComposer
        value={input}
        onChange={setInput}
        onSubmit={() => void send(input)}
        onStop={stop}
        streaming={streaming}
        placeholder="Ask about this case, or search planning data…"
        material="solid"
      />
    </div>
  );
}
