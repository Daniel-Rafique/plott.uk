"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import type { AgentChatMessage, PlanningQaContext } from "./types";

/**
 * Stream a planning Q&A turn from `/api/ai/chat` into the message list.
 */
export function useChatStream({
  onResults,
}: {
  onResults?: (entities: PlanningApplicationEntity[]) => void;
} = {}) {
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, []);

  const sendChat = useCallback(
    async (
      messages: AgentChatMessage[],
      application: PlanningQaContext | undefined,
      setMessages: Dispatch<SetStateAction<AgentChatMessage[]>>,
    ) => {
      setError(null);
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages.map(({ role, content }) => ({ role, content })),
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
    [onResults],
  );

  return { streaming, error, setError, sendChat, stop, abortRef };
}
