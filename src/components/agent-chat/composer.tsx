"use client";

import { Send, StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  placeholder = "Ask about planning, or describe what to find…",
  disabled,
  className,
  material = "solid",
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  streaming: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Translucent chrome for the dashboard rail; solid for modal panels. */
  material?: "solid" | "glass";
}) {
  return (
    <form
      className={cn(
        "flex items-end gap-1.5 border-t border-zinc-200/80 p-2.5",
        material === "glass"
          ? "bg-white/70 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-white/55 motion-reduce:bg-white motion-reduce:backdrop-filter-none"
          : "bg-white",
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        disabled={streaming || disabled}
        rows={2}
        className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-zinc-300/80 bg-white/90 px-3 py-2 text-sm leading-snug focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:bg-zinc-50"
        aria-label="Message"
      />
      {streaming ? (
        <button
          type="button"
          onClick={onStop}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-red-600 px-3 text-xs font-semibold text-white transition-transform active:scale-[0.97] hover:bg-red-700"
        >
          <StopCircle className="h-3.5 w-3.5" aria-hidden />
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={!value.trim() || disabled}
          className="inline-flex h-10 items-center gap-1 rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white transition-transform active:scale-[0.97] hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          Send
        </button>
      )}
    </form>
  );
}
