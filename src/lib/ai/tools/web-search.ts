/**
 * Web search tool via Tavily (https://tavily.com). Returns a small set of
 * ranked results with title, URL, and an extracted answer. We cap results to
 * 5 to keep token cost bounded.
 */

import { tool } from "ai";
import { z } from "zod";

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

type TavilyResponse = {
  answer?: string;
  results?: TavilyResult[];
};

export const webSearchTool = tool({
  description:
    "Search the public web for current information (news, company websites, recent projects). Returns up to 5 ranked snippets with source URLs. Prefer this over guessing.",
  inputSchema: z.object({
    query: z.string().min(2).describe("The search query — be specific."),
    topic: z
      .enum(["general", "news"])
      .default("general")
      .describe("Use 'news' for time-sensitive results."),
  }),
  execute: async ({ query, topic }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return { configured: false as const, results: [] };
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          topic,
          max_results: 5,
          include_answer: true,
          search_depth: "basic",
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        return { configured: true as const, results: [], error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as TavilyResponse;
      return {
        configured: true as const,
        answer: data.answer ?? null,
        results: (data.results ?? []).slice(0, 5).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          snippet: (r.content ?? "").slice(0, 400),
          score: r.score ?? 0,
        })),
      };
    } catch (e) {
      return {
        configured: true as const,
        results: [],
        error: e instanceof Error ? e.message : "Web search failed",
      };
    }
  },
});
