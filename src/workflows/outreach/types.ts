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
   * When true, route this lead through the refusal-appeals workflow instead of
   * the standard outreach drafter.
   */
  isRefusal?: boolean;
  /** When true, run job_estimator before drafting (capped per digest run). */
  runEstimate?: boolean;
};

export type WorkflowOutcome =
  | {
      outcome: "skipped" | "dropped";
      reason: string;
    }
  | {
      outcome: "queued";
      approvalId: string;
      autoApproved?: boolean;
      letterId?: string | null;
    };
