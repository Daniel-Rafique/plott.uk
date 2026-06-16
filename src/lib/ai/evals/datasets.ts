/**
 * Eval datasets for our agents. Kept inline (instead of a JSON fixture) so
 * they travel with the code and diffs show up cleanly in PRs. Each dataset
 * has between 5 and 15 items — enough to catch regressions, not so many that
 * CI costs balloon.
 *
 * When you add a new agent, add a matching dataset here and register it in
 * `run.ts`.
 */

export type ComplianceCase = {
  id: string;
  subject: string;
  bodyHtml: string;
  /** Expected `passed` value from the compliance guardrail. */
  expectedPassed: boolean;
  /** Optional tag — helps explain failures in CI output. */
  note?: string;
};

export const COMPLIANCE_DATASET: ComplianceCase[] = [
  {
    id: "compliance-01-benign",
    subject: "We'd like to introduce ourselves",
    bodyHtml:
      "<p>Dear Sir/Madam,</p><p>We noticed your recent planning application and would welcome a short conversation if useful. You can unsubscribe at any time by replying STOP.</p><p>Kind regards,<br/>Acme Construction</p>",
    expectedPassed: true,
    note: "Clean, GDPR-lite letter with opt-out.",
  },
  {
    id: "compliance-02-guaranteed-approval",
    subject: "Guaranteed planning permission!",
    bodyHtml:
      "<p>We <strong>guarantee</strong> that your planning application will be approved if you use our service. 100% success rate!</p>",
    expectedPassed: false,
    note: "Explicit guarantee of approval — must be blocked.",
  },
  {
    id: "compliance-03-missing-optout",
    subject: "Quick intro",
    bodyHtml:
      "<p>Hello,</p><p>We do residential extensions and would love to work with you. Call us on 020 1234 5678.</p>",
    expectedPassed: false,
    note: "No opt-out line — should flag.",
  },
  {
    id: "compliance-04-existing-relationship",
    subject: "Following up from our last chat",
    bodyHtml:
      "<p>Dear James,</p><p>Following up from <strong>our previous conversation</strong> about your extension — would you like to proceed? Reply STOP to unsubscribe.</p>",
    expectedPassed: false,
    note: "Implies an existing relationship that doesn't exist.",
  },
  {
    id: "compliance-05-mild-urgency",
    subject: "Your planning application",
    bodyHtml:
      "<p>Dear applicant,</p><p>We specialise in residential projects in your area and would be happy to help. Reply STOP to opt out.</p><p>Kind regards,<br/>Acme Construction Ltd</p>",
    expectedPassed: true,
    note: "Benign cold outreach — should pass.",
  },
  {
    id: "compliance-06-pii-leak",
    subject: "Your planning application at 10 Acacia Avenue",
    bodyHtml:
      "<p>Hi John Smith, we see your NI number is AB123456C and you applied on 2024-05-01. Reply STOP to opt out.</p>",
    expectedPassed: false,
    note: "Includes sensitive PII (NI number) — must be blocked.",
  },
];

export type IcpCase = {
  id: string;
  icp: {
    description: string;
    keywords: string[];
    statuses: string[];
    minProjectValueGbp: number | null;
  };
  candidate: {
    planningEntity: number;
    reference: string;
    siteAddress: string | null;
    description: string | null;
    status?: string | null;
    applicationType?: string | null;
  };
  expectedFit: boolean;
  note?: string;
};

export const ICP_DATASET: IcpCase[] = [
  {
    id: "icp-01-match",
    icp: {
      description:
        "Residential extensions and loft conversions in Greater London.",
      keywords: ["extension", "loft", "conversion"],
      statuses: ["pending", "under consideration"],
      minProjectValueGbp: null,
    },
    candidate: {
      planningEntity: 1,
      reference: "24/00001",
      siteAddress: "12 Acacia Avenue, London N1",
      description: "Single-storey rear extension and loft conversion",
      status: "pending",
      applicationType: "householder",
    },
    expectedFit: true,
  },
  {
    id: "icp-02-wrong-status",
    icp: {
      description: "Residential extensions in London.",
      keywords: ["extension"],
      statuses: ["pending"],
      minProjectValueGbp: null,
    },
    candidate: {
      planningEntity: 2,
      reference: "24/00002",
      siteAddress: "5 Elm St, London",
      description: "Single-storey rear extension",
      status: "approved",
      applicationType: "householder",
    },
    expectedFit: false,
    note: "Approved — our ICP only cares about in-flight cases.",
  },
  {
    id: "icp-03-out-of-scope",
    icp: {
      description: "Residential extensions in London.",
      keywords: ["extension", "loft"],
      statuses: ["pending"],
      minProjectValueGbp: null,
    },
    candidate: {
      planningEntity: 3,
      reference: "24/00003",
      siteAddress: "Unit 4, Industrial Park, Manchester",
      description: "Change of use from B8 to B1 office",
      status: "pending",
      applicationType: "full",
    },
    expectedFit: false,
    note: "Commercial change of use, wrong region.",
  },
  {
    id: "icp-04-solar-yes",
    icp: {
      description:
        "Solar/PV installations on domestic properties across the South East.",
      keywords: ["solar", "pv", "photovoltaic"],
      statuses: ["pending", "under consideration"],
      minProjectValueGbp: null,
    },
    candidate: {
      planningEntity: 4,
      reference: "24/00004",
      siteAddress: "9 Oak Road, Brighton",
      description: "Installation of roof-mounted photovoltaic panels",
      status: "pending",
      applicationType: "householder",
    },
    expectedFit: true,
  },
  {
    id: "icp-05-ambiguous",
    icp: {
      description: "Small commercial signage projects.",
      keywords: ["signage", "advertisement"],
      statuses: ["pending"],
      minProjectValueGbp: null,
    },
    candidate: {
      planningEntity: 5,
      reference: "24/00005",
      siteAddress: "The Old Mill, Cotswolds",
      description: "Retrospective application for 2 no. fascia signs",
      status: "pending",
      applicationType: "advertisement",
    },
    expectedFit: true,
  },
];

export type NlSearchCase = {
  id: string;
  prompt: string;
  /** Subset of filter keys that MUST appear in the parsed response. */
  expectKeys: string[];
  /** Optional literal assertions. */
  expect?: Record<string, unknown>;
  note?: string;
};

export const NL_SEARCH_DATASET: NlSearchCase[] = [
  {
    id: "nl-01-decision-window",
    prompt: "Show me householder applications approved in the last 30 days in SW1",
    expectKeys: ["applicationTypes", "locationHint"],
  },
  {
    id: "nl-02-loft-keyword",
    prompt: "Loft conversions in Camden that are still pending",
    expectKeys: ["keywords", "locationHint"],
  },
  {
    id: "nl-03-recent-activity",
    prompt: "Anything with a decision in the last 7 days",
    expectKeys: ["decisionFrom"],
    note: "Model should return a date string, any format.",
  },
  {
    id: "nl-04-commercial",
    prompt: "Commercial change of use to office in Manchester",
    expectKeys: ["locationHint", "keywords"],
  },
  {
    id: "nl-05-solar",
    prompt: "Recent solar panel installations across Sussex",
    expectKeys: ["keywords", "locationHint"],
  },
];
