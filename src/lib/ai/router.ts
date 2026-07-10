/**
 * Model router. One place to map task kinds → provider + model.
 *
 * All traffic flows through the Vercel AI Gateway (`gateway()` from the `ai`
 * package). Authentication is automatic on Vercel deployments via the injected
 * OIDC token; locally we fall back to `AI_GATEWAY_API_KEY`. This means we no
 * longer import `@ai-sdk/anthropic|openai|google` — the gateway handles
 * provider selection server-side from the slash-prefixed model id.
 *
 * - Claude Sonnet: multi-step agents where reliability matters (outreach,
 *   enrichment, research).
 * - Claude Haiku: high-volume cheap checks (compliance, ICP classifier,
 *   digest summaries).
 * - GPT: low-latency structured outputs (NL search, letter tone rewrites).
 * - Gemini: future vision + grounded search.
 *
 * Everything else in the runtime only knows about `AgentKind`, never about
 * provider strings — that keeps swaps to this file alone.
 */

import { gateway } from "ai";
import type { LanguageModel } from "ai";
import { getUsdToGbpRate } from "@/lib/fx";

export type AgentKind =
  | "nl_search"
  | "letter_assist"
  | "compliance_guardrail"
  | "enrichment_agent"
  | "applicant_research"
  | "digest_summary"
  | "icp_classifier"
  | "outreach_drafter"
  | "appeal_classifier"
  | "appeal_pitch_drafter"
  | "planning_qa"
  | "job_estimator";

export type ModelPreset = {
  kind: AgentKind;
  /**
   * Informational only — used for AgentRun.model strings and cost tables.
   * Gateway routes purely off `modelId`.
   */
  provider: "anthropic" | "openai" | "google";
  /** Slash-prefixed Vercel AI Gateway model id, e.g. `anthropic/claude-sonnet-4-5`. */
  modelId: string;
  /** Per-million-token costs in USD for cost estimation. */
  usdPerMInput: number;
  usdPerMOutput: number;
  /** Soft defaults. Callers can override. */
  maxSteps?: number;
  timeoutMs?: number;
};

const PRESETS: Record<AgentKind, ModelPreset> = {
  nl_search: {
    kind: "nl_search",
    provider: "openai",
    modelId: "openai/gpt-4.1",
    usdPerMInput: 2.0,
    usdPerMOutput: 8.0,
    maxSteps: 1,
    timeoutMs: 20_000,
  },
  letter_assist: {
    kind: "letter_assist",
    provider: "openai",
    modelId: "openai/gpt-4.1",
    usdPerMInput: 2.0,
    usdPerMOutput: 8.0,
    maxSteps: 3,
    timeoutMs: 45_000,
  },
  compliance_guardrail: {
    kind: "compliance_guardrail",
    provider: "anthropic",
    modelId: "anthropic/claude-haiku-4-5",
    usdPerMInput: 1.0,
    usdPerMOutput: 5.0,
    maxSteps: 1,
    timeoutMs: 20_000,
  },
  enrichment_agent: {
    kind: "enrichment_agent",
    provider: "anthropic",
    modelId: "anthropic/claude-sonnet-4-5",
    usdPerMInput: 3.0,
    usdPerMOutput: 15.0,
    // Most enrichment work is done by the deterministic cascade before the
    // agent runs. Hunter can add 1-3 structured email steps on top of the
    // Companies House/web fallback, so leave enough room for that path.
    // 50s leaves enough budget (10s) for the route handler to finish
    // before Next.js cuts us off at `maxDuration = 60`.
    maxSteps: 10,
    timeoutMs: 50_000,
  },
  applicant_research: {
    kind: "applicant_research",
    provider: "anthropic",
    modelId: "anthropic/claude-sonnet-4-5",
    usdPerMInput: 3.0,
    usdPerMOutput: 15.0,
    maxSteps: 10,
    timeoutMs: 60_000,
  },
  digest_summary: {
    kind: "digest_summary",
    provider: "anthropic",
    modelId: "anthropic/claude-haiku-4-5",
    usdPerMInput: 1.0,
    usdPerMOutput: 5.0,
    maxSteps: 1,
    timeoutMs: 30_000,
  },
  icp_classifier: {
    kind: "icp_classifier",
    provider: "anthropic",
    modelId: "anthropic/claude-haiku-4-5",
    usdPerMInput: 1.0,
    usdPerMOutput: 5.0,
    maxSteps: 1,
    timeoutMs: 15_000,
  },
  outreach_drafter: {
    kind: "outreach_drafter",
    provider: "anthropic",
    modelId: "anthropic/claude-sonnet-4-5",
    usdPerMInput: 3.0,
    usdPerMOutput: 15.0,
    maxSteps: 6,
    timeoutMs: 60_000,
  },
  appeal_classifier: {
    kind: "appeal_classifier",
    provider: "anthropic",
    // Haiku is plenty for the classification rubric; we upgrade to Sonnet
    // only for the pitch letter draft where nuance matters.
    modelId: "anthropic/claude-haiku-4-5",
    usdPerMInput: 1.0,
    usdPerMOutput: 5.0,
    maxSteps: 4,
    timeoutMs: 30_000,
  },
  appeal_pitch_drafter: {
    kind: "appeal_pitch_drafter",
    provider: "anthropic",
    modelId: "anthropic/claude-sonnet-4-5",
    usdPerMInput: 3.0,
    usdPerMOutput: 15.0,
    maxSteps: 4,
    timeoutMs: 60_000,
  },
  planning_qa: {
    kind: "planning_qa",
    provider: "anthropic",
    modelId: "anthropic/claude-sonnet-4-5",
    usdPerMInput: 3.0,
    usdPerMOutput: 15.0,
    maxSteps: 8,
    timeoutMs: 60_000,
  },
  job_estimator: {
    kind: "job_estimator",
    provider: "anthropic",
    modelId: "anthropic/claude-sonnet-4-5",
    usdPerMInput: 3.0,
    usdPerMOutput: 15.0,
    maxSteps: 1,
    timeoutMs: 45_000,
  },
};

export function getPreset(kind: AgentKind): ModelPreset {
  return PRESETS[kind];
}

export function getModel(kind: AgentKind): LanguageModel {
  return gateway(getPreset(kind).modelId);
}

/**
 * Convert provider token usage to GBP using the live USD→GBP rate (cached,
 * Frankfurter-backed). Falls back to `AI_USD_GBP_RATE` env / hardcoded 0.78
 * if the upstream FX API is unavailable — see `src/lib/fx.ts`.
 */
export async function estimateCostGbp(
  kind: AgentKind,
  promptTokens: number,
  completionTokens: number,
): Promise<number> {
  const p = getPreset(kind);
  const usd =
    (promptTokens / 1_000_000) * p.usdPerMInput +
    (completionTokens / 1_000_000) * p.usdPerMOutput;
  const usdToGbp = await getUsdToGbpRate();
  return Number((usd * usdToGbp).toFixed(6));
}

/**
 * Gateway credential env var. We check the presence of either a user-supplied
 * gateway key (local dev) or the Vercel OIDC indicator (`VERCEL=1` is set on
 * every Vercel runtime). Argument kept for signature compatibility with
 * `AgentProviderError` even though the gateway is one credential for all.
 */
export function providerEnvKey(kind: AgentKind): string {
  void getPreset(kind);
  return "AI_GATEWAY_API_KEY";
}

export function isProviderConfigured(kind: AgentKind): boolean {
  void getPreset(kind);
  return Boolean(process.env.AI_GATEWAY_API_KEY) || Boolean(process.env.VERCEL);
}
