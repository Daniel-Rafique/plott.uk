/**
 * Canonical product marketing copy. Import from here instead of hardcoding
 * stats, trial CTAs, or feature bullets in pages and components.
 */

import { TRIAL_DAYS } from "@/lib/trial";

export const UK_LPA_COUNT = 337;

export function lpaCoverageShort(): string {
  return `${UK_LPA_COUNT} LPAs covered`;
}

export function lpaCoverageFull(): string {
  return `all ${UK_LPA_COUNT} UK local planning authorities`;
}

export const MARKETING_STATS = {
  applicationsIndexed: {
    display: "2.4M",
    value: 2.4,
    suffix: "M" as const,
    label: "Applications indexed",
    labelLong: "Planning applications indexed",
    sublabel: "Updated daily from the national dataset",
  },
  lpaCount: {
    display: String(UK_LPA_COUNT),
    value: UK_LPA_COUNT,
    label: "Local planning authorities",
    sublabel: "England-wide coverage",
  },
  applicantMatchRate: {
    display: "94%",
    value: 94,
    suffix: "%" as const,
    label: "Applicant match rate",
    sublabel: "Multi-source enrichment pipeline",
    bullet: "94% applicant match rate across enrichment",
  },
  digestCadence: {
    display: "48",
    value: 48,
    suffix: "h" as const,
    label: "Digest cadence",
    sublabel: "New leads every two working days",
  },
} as const;

export const SEO_TITLE = "Plott — Win every planning application in the UK";

export const PRODUCT_TAGLINE = "Live planning intelligence for the UK";

export const PRODUCT_HEADLINE = "See every site before your competitors do.";

export const PRODUCT_SIGNIN_HEADLINE =
  "Win every planning application in your patch.";

export const PRODUCT_DESCRIPTION =
  "Map-first planning-application search with photorealistic 3D, applicant enrichment and branded letter + email outreach — one workspace for UK construction, property and planning teams.";

export const PRODUCT_DESCRIPTION_SHORT =
  "Turn open UK planning applications into signed contracts with map-first planning intelligence.";

export const PRODUCT_META_DESCRIPTION =
  "Turn open UK planning applications into signed contracts. 3D maps, applicant enrichment, AI-drafted letter and email outreach, and saved-search digests for UK construction and property teams.";

export const AUTH_BENEFITS = [
  {
    title: "Map-first search",
    description:
      "Draw your patch and see every planning application as it lands.",
  },
  {
    title: "Applicant enrichment",
    description:
      "Match applicants and agents from multiple authoritative sources.",
  },
  {
    title: "Branded outreach",
    description:
      "AI-drafted print letters and emails — reviewed and sent from one workspace.",
  },
] as const;

export const AUTH_STATS = [
  {
    value: MARKETING_STATS.applicationsIndexed.display,
    label: MARKETING_STATS.applicationsIndexed.label,
  },
  {
    value: MARKETING_STATS.lpaCount.display,
    label: MARKETING_STATS.lpaCount.label,
  },
  {
    value: MARKETING_STATS.applicantMatchRate.display,
    label: MARKETING_STATS.applicantMatchRate.label,
  },
] as const;

export type ByTheNumbersStat = {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  sublabel: string;
};

export const BY_THE_NUMBERS_STATS: ByTheNumbersStat[] = [
  {
    value: MARKETING_STATS.applicationsIndexed.value,
    suffix: MARKETING_STATS.applicationsIndexed.suffix,
    label: MARKETING_STATS.applicationsIndexed.labelLong,
    sublabel: MARKETING_STATS.applicationsIndexed.sublabel,
  },
  {
    value: MARKETING_STATS.lpaCount.value,
    label: MARKETING_STATS.lpaCount.label,
    sublabel: MARKETING_STATS.lpaCount.sublabel,
  },
  {
    value: MARKETING_STATS.applicantMatchRate.value,
    suffix: MARKETING_STATS.applicantMatchRate.suffix,
    label: MARKETING_STATS.applicantMatchRate.label,
    sublabel: MARKETING_STATS.applicantMatchRate.sublabel,
  },
  {
    value: MARKETING_STATS.digestCadence.value,
    suffix: MARKETING_STATS.digestCadence.suffix,
    label: MARKETING_STATS.digestCadence.label,
    sublabel: MARKETING_STATS.digestCadence.sublabel,
  },
];

export const HOMEPAGE_FEATURES = [
  {
    title: "Photorealistic 3D discovery",
    body: "Scan sites in true 3D with Google's aerial tiles. See buildable footprints, rooflines and street context before you pick up the phone.",
  },
  {
    title: "Every LPA in one index",
    body: `${UK_LPA_COUNT} local planning authorities, unified into a single dataset. Search by map area, reference, development type, status or decision window.`,
  },
  {
    title: "Saved searches, delivered",
    body: "Pin a patch. We'll email you a digest of new applications every 48 hours — no manual re-running, no duplicates.",
  },
  {
    title: "Letter + email outreach",
    body: "AI drafts branded A4 letters and inbox-ready emails. Human approval, compliance checks, single PDFs, bulk ZIP export, or approve-and-send.",
  },
  {
    title: "Applicant enrichment",
    body: "Names, agents and return addresses resolved automatically from authoritative sources. Compliant outreach starts with the right recipient.",
  },
  {
    title: "Built for construction teams",
    body: "Teams, roles and seat-level billing. Bring BD, QS and ops into one workspace without juggling spreadsheets.",
  },
] as const;

export function verifyEmailSubtitle(): string {
  return `You're one step from searching ${MARKETING_STATS.applicationsIndexed.display} planning applications. Enter the code we sent to your email.`;
}

export function faqWhatIsPlott(): string {
  return "Plott is a map-first planning intelligence platform that helps UK construction, property and planning teams find live planning applications, enrich applicant details, and create letter and email outreach.";
}

export function faqWhoIsPlottFor(): string {
  return "Plott is built for builders, architects, property consultants and planning teams that want to find high-intent local projects before competitors do.";
}

export function faqUkCoverage(): string {
  return `Plott covers ${lpaCoverageFull()} and combines planning data with applicant enrichment and saved-search monitoring.`;
}

export function faqDataSources(): string {
  return `We aggregate data from official UK government registers and commercial planning databases, covering ${lpaCoverageFull()} with continuous refresh. Applicant enrichment combines multiple authoritative sources including property ownership records and corporate filings. Coverage varies by council — we're transparent about this in the app.`;
}

export function faqGdpr(): string {
  return "Yes. We're a UK-registered company, store customer data on UK and EU infrastructure, and use only lawful sources for planning-application data. All outreach generated through the platform uses legitimate-interest basis for B2B contact.";
}

export function faqTrialWorks(): { question: string; answer: string } {
  return {
    question: `How does the ${TRIAL_DAYS}-day trial work?`,
    answer: `Start any plan from the pricing grid, enter your card details in Stripe Checkout, and you won't be charged for ${TRIAL_DAYS} days. Cancel any time from the billing portal with a single click.`,
  };
}

export function pricingHeroDescription(): string {
  return `Start with a ${TRIAL_DAYS}-day trial on any plan. Cancel from the billing portal any time. VAT added automatically where applicable.`;
}

export function pricingMetadataTrialPhrase(): string {
  return `${TRIAL_DAYS}-day trial`;
}

export function termsTrialSentence(): string {
  const word = TRIAL_DAYS === 1 ? "day" : "days";
  return `A ${TRIAL_DAYS}-${word} trial is available on the first subscription per Customer.`;
}
