import type { PlanningApplicationEntity } from "@/lib/planning-data";

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
  results?: PlanningApplicationEntity[];
  /** Transient status shown while a deep-search stream is running. */
  statusLine?: string | null;
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

export type QaResultPinActions = {
  canPin: boolean;
  isPinned: (row: PlanningApplicationEntity) => boolean;
  onTogglePin: (row: PlanningApplicationEntity) => void;
  pinPendingKey: string | null;
  pinKey: (row: PlanningApplicationEntity) => string;
};
