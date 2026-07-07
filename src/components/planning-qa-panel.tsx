"use client";

/**
 * Planning Q&A chatbot panel.
 *
 * Drop into any view where an application is in focus. Streams answers from
 * `/api/ai/chat` and renders them live. The panel is stateless between mounts
 * — close + reopen resets the conversation, which is deliberate (each case
 * should start fresh to avoid cross-contamination between applications).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, Bot, User, StopCircle, MapPin, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownMessage } from "./markdown-message";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import gsap from "gsap";

type Msg = {
  role: "user" | "assistant";
  content: string;
  results?: PlanningApplicationEntity[];
};

export type PlanningQaContext = {
  reference?: string;
  planningEntity?: number;
  organisationEntity?: string | number | null;
  siteAddress?: string | null;
  description?: string | null;
  status?: string | null;
  applicationType?: string | null;
  lpaName?: string | null;
  postcode?: string | null;
  applicantName?: string | null;
};

const SUGGESTIONS = [
  "Summarise this application in plain English.",
  "What stage is this at and what happens next?",
  "Who is the applicant and are they a company?",
  "Other recent applications in this council",
  "Refused applications nearby",
];

const BAR_HEIGHTS = [10, 14, 18, 14, 10, 16, 12];

/** Animated waveform shown while the AI is generating a response. */
function StreamingWaveform() {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const ctxRef = useRef<ReturnType<typeof gsap.context> | null>(null);

  useEffect(() => {
    ctxRef.current = gsap.context(() => {
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        gsap.to(bar, {
          scaleY: 0.2,
          duration: 0.45 + i * 0.04,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: i * 0.09,
        });
      });
    });
    return () => ctxRef.current?.revert();
  }, []);

  return (
    <span
      className="inline-flex items-end gap-[3px]"
      aria-label="AI thinking"
      role="status"
    >
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="inline-block w-[3px] rounded-full bg-indigo-400 origin-bottom"
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

/** Pulsing glow ring shown around the header badge when streaming. */
function StreamingSparkle() {
  const dotRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!dotRef.current) return;
    const ctx = gsap.context(() => {
      gsap.to(dotRef.current, {
        opacity: 0.3,
        scale: 1.4,
        duration: 0.7,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <span className="relative flex h-2 w-2">
      <span
        ref={dotRef}
        className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"
      />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-600" />
    </span>
  );
}

/** Colour a status/decision label green/red/neutral like the sidebar badges. */
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
function ResultBubble({
  row,
  onClick,
}: {
  row: PlanningApplicationEntity;
  onClick?: () => void;
}) {
  const status =
    row["planning-decision-type"] || row["planning-application-status"];
  const address = row["address-text"];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/40 focus:outline-none focus:ring-1 focus:ring-indigo-400"
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
          className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-indigo-500"
          aria-hidden
        />
      </div>
    </button>
  );
}

export function PlanningQaPanel({
  application,
  className,
  onViewApplicant,
  onResults,
}: {
  application?: PlanningQaContext;
  className?: string;
  /** Open a result in the modal (re-seeds the focused case). */
  onViewApplicant?: (row: PlanningApplicationEntity) => void;
  /** Fired when a search returns results, so the host can sync map/sidebar. */
  onResults?: (entities: PlanningApplicationEntity[]) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  // Animate the header gradient while the AI is streaming
  useEffect(() => {
    if (!headerRef.current) return;
    if (streaming) {
      gsap.to(headerRef.current, {
        backgroundImage:
          "linear-gradient(to right, #e0e7ff, #ede9fe, #ddd6fe, #e0e7ff)",
        backgroundSize: "200% 100%",
        duration: 1.4,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    } else {
      gsap.killTweensOf(headerRef.current);
      gsap.to(headerRef.current, {
        backgroundImage: "linear-gradient(to right, #eef2ff, #f5f3ff)",
        duration: 0.4,
        ease: "power2.out",
      });
    }
  }, [streaming]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);
      const next: Msg[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setInput("");
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next,
            application: application
              ? {
                  reference: application.reference ?? undefined,
                  planningEntity: application.planningEntity ?? undefined,
                  organisationEntity:
                    application.organisationEntity ?? undefined,
                  siteAddress: application.siteAddress ?? undefined,
                  description: application.description ?? undefined,
                  status: application.status ?? undefined,
                  applicationType: application.applicationType ?? undefined,
                  lpaName: application.lpaName ?? undefined,
                }
              : undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const msg =
            (await res
              .json()
              .then((j: { error?: string }) => j.error)
              .catch(() => null)) || `Request failed (${res.status})`;
          throw new Error(msg);
        }
        if (!res.body) throw new Error("No response body");

        setMessages((m) => [...m, { role: "assistant", content: "" }]);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";

        const applyFrame = (line: string) => {
          const trimmedLine = line.trim();
          if (!trimmedLine) return;
          let frame: {
            type?: string;
            delta?: string;
            entities?: PlanningApplicationEntity[];
            message?: string;
          };
          try {
            frame = JSON.parse(trimmedLine);
          } catch {
            return;
          }
          if (frame.type === "text" && frame.delta) {
            text += frame.delta;
            const snapshot = text;
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                role: "assistant",
                content: snapshot,
              };
              return copy;
            });
          } else if (frame.type === "results" && frame.entities?.length) {
            const entities = frame.entities;
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                role: "assistant",
                results: entities,
              };
              return copy;
            });
            onResults?.(entities);
          } else if (frame.type === "error" && frame.message) {
            setError(frame.message);
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl = buffer.indexOf("\n");
          while (nl !== -1) {
            applyFrame(buffer.slice(0, nl));
            buffer = buffer.slice(nl + 1);
            nl = buffer.indexOf("\n");
          }
        }
        if (buffer.trim()) applyFrame(buffer);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setMessages((m) =>
          m.length &&
          m[m.length - 1].role === "assistant" &&
          m[m.length - 1].content === "" &&
          !m[m.length - 1].results?.length
            ? m.slice(0, -1)
            : m,
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, application, onResults],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white",
        className,
      )}
    >
      <header
        ref={headerRef}
        className="flex items-center justify-between border-b border-zinc-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <Sparkles
            className={cn(
              "h-4 w-4 transition-colors duration-300",
              streaming ? "text-indigo-500" : "text-indigo-600",
            )}
            aria-hidden
          />
          <p className="text-sm font-semibold text-zinc-900">
            Ask about this application
          </p>
          {streaming && (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-500">
              <StreamingSparkle />
              Generating
            </span>
          )}
        </div>
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-indigo-700">
          AI
        </span>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">
              Ask anything about this case — the assistant can look up
              planning records, council data and applicant details.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
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
                  <div className="mt-0.5 rounded-full bg-indigo-100 p-1">
                    <Bot className="h-3 w-3 text-indigo-700" aria-hidden />
                  </div>
                ) : null}
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-snug transition-shadow duration-300",
                    m.role === "user"
                      ? "whitespace-pre-wrap bg-zinc-900 text-white"
                      : "bg-zinc-50 text-zinc-800",
                    // Glow while this specific bubble is still being written
                    m.role === "assistant" && !m.content && streaming
                      ? "ring-1 ring-indigo-200 shadow-[0_0_12px_rgba(99,102,241,0.15)]"
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
                      <span className="text-[11px] font-medium text-indigo-400 tracking-wide">
                        thinking
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
                  {m.results.map((row) => (
                    <ResultBubble
                      key={row.entity}
                      row={row}
                      onClick={
                        onViewApplicant
                          ? () => onViewApplicant(row)
                          : undefined
                      }
                    />
                  ))}
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

      <form
        className="flex items-center gap-1.5 border-t border-zinc-200 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this application…"
          disabled={streaming}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-50"
          aria-label="Question"
        />
        {streaming ? (
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
          >
            <StopCircle className="h-3.5 w-3.5" aria-hidden />
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            Ask
          </button>
        )}
      </form>
    </div>
  );
}
