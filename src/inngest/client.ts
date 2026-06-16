import { Inngest } from "inngest";

/**
 * Inngest client for durable multi-step workflows (autonomous outreach,
 * batch enrichment, retries). Serves as the event-producer API for the rest
 * of the app; consumers live under `src/inngest/functions/`.
 */
export const inngest = new Inngest({
  id: "plott",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

/**
 * Typed event payloads. Kept as documentation + helpers for publishers; the
 * Inngest v4 SDK resolves event typing via the trigger string rather than
 * client-level generics, so these types are most useful when constructing
 * payloads on the producer side.
 */
export type OutreachLeadDiscoveredPayload = {
  companyId: string;
  savedSearchId: string;
  planningEntity: number;
  reference?: string;
  siteAddress?: string;
  description?: string;
  /** Raw PlanWire status (e.g. "Granted", "Refused", "Pending"). */
  status?: string;
  /** Raw PlanWire decision ("Refused", "Granted", "Split decision", etc.). */
  decision?: string;
  /**
   * When true, route this lead through the refusal-appeals pipeline
   * instead of the standard outreach drafter.
   */
  isRefusal?: boolean;
};

export type EnrichmentRequestedPayload = {
  companyId: string;
  planningEntity: number;
  reference: string;
  organisationEntity?: string | number | null;
  lpaWebsite?: string | null;
};

export type ResearchRequestedPayload = {
  companyId: string;
  userId?: string;
  displayName: string;
  hint?: string;
};
