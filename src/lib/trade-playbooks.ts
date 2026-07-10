/**
 * Trade playbook presets — one-click ICP + letter template + rate-card defaults.
 */

export type TradePlaybookId =
  | "loft_extension_builder"
  | "general_builder"
  | "roofing"
  | "planning_consultant";

export type TradePlaybook = {
  id: TradePlaybookId;
  name: string;
  summary: string;
  icp: {
    description: string;
    keywords: string[];
    excludedKeywords: string[];
    preferredStatuses: string[];
    minProjectValueGbp: number | null;
    targetRefusals: boolean;
    appealServiceType: string | null;
  };
  letterTemplate: {
    name: string;
    subject: string;
    bodyHtml: string;
  };
  rateCard: {
    dayRateGbp: number;
    crewSizeDefault: number;
    unitRates: Record<string, number>;
    typicalWeeks: Record<string, number>;
    contingencyPercent: number;
    vatInclusive: boolean;
  };
  suggestedFilterKeywords: string[];
};

const BALLPARK_HINT =
  "<p>We can share an indicative sense of cost and programme for projects like yours once we have reviewed the plans — any figures we mention are ballpark only and subject to a site survey.</p>";

export const TRADE_PLAYBOOKS: TradePlaybook[] = [
  {
    id: "loft_extension_builder",
    name: "Loft & extension builder",
    summary:
      "Residential loft conversions, dormers and rear extensions for householders.",
    icp: {
      description:
        "We specialise in loft conversions and rear/side extensions for residential homes, typically £60,000–£150,000. We focus on householder and full applications for extensions, dormers and loft works.",
      keywords: [
        "loft",
        "dormer",
        "extension",
        "rear extension",
        "side extension",
        "conversion",
      ],
      excludedKeywords: [
        "commercial",
        "industrial",
        "warehouse",
        "demolition",
        "advertisement",
      ],
      preferredStatuses: ["pending", "approved", "granted"],
      minProjectValueGbp: 40000,
      targetRefusals: false,
      appealServiceType: null,
    },
    letterTemplate: {
      name: "Loft & extension intro",
      subject: "Your planning application at {{site}} — {{ref}}",
      bodyHtml: `<p>I noticed your planning application for works at the property and wanted to introduce our team. We regularly deliver loft conversions and home extensions in your area.</p>
<p>If it would be helpful, I would be glad to discuss how we approach similar projects and what a realistic programme looks like.</p>
${BALLPARK_HINT}
<p>If you would prefer not to hear from us again, just reply and we will close your file.</p>`,
    },
    rateCard: {
      dayRateGbp: 450,
      crewSizeDefault: 3,
      unitRates: {
        loft_conversion: 2200,
        rear_extension: 2800,
        side_extension: 2600,
        general_works: 1800,
      },
      typicalWeeks: {
        loft_conversion: 8,
        rear_extension: 10,
        side_extension: 9,
        general_works: 6,
      },
      contingencyPercent: 10,
      vatInclusive: false,
    },
    suggestedFilterKeywords: ["loft", "extension", "dormer"],
  },
  {
    id: "general_builder",
    name: "General builder",
    summary:
      "Mixed residential renovations, extensions and refurbishments across a local patch.",
    icp: {
      description:
        "We handle residential extensions, renovations and refurbishments. Interested in projects from about £30,000 upwards. We avoid large commercial and industrial schemes.",
      keywords: [
        "extension",
        "renovation",
        "refurbishment",
        "alteration",
        "householder",
      ],
      excludedKeywords: ["industrial", "warehouse", "advertisement", "telecoms"],
      preferredStatuses: ["pending", "approved", "granted"],
      minProjectValueGbp: 30000,
      targetRefusals: false,
      appealServiceType: null,
    },
    letterTemplate: {
      name: "General builder intro",
      subject: "Local builder — planning application {{ref}}",
      bodyHtml: `<p>I saw your planning application and wanted to introduce ourselves as a local building firm covering your area.</p>
<p>We help homeowners move from approved plans to a clear build programme, with straightforward communication throughout.</p>
${BALLPARK_HINT}
<p>Happy to leave you in peace if this is not useful — just let us know.</p>`,
    },
    rateCard: {
      dayRateGbp: 400,
      crewSizeDefault: 2,
      unitRates: {
        rear_extension: 2500,
        side_extension: 2400,
        loft_conversion: 2000,
        general_works: 1600,
        re_roof: 120,
      },
      typicalWeeks: {
        rear_extension: 8,
        side_extension: 8,
        loft_conversion: 7,
        general_works: 5,
        re_roof: 2,
      },
      contingencyPercent: 12,
      vatInclusive: false,
    },
    suggestedFilterKeywords: ["extension", "renovation", "alteration"],
  },
  {
    id: "roofing",
    name: "Roofing contractor",
    summary: "Re-roofs, roof extensions and related residential roofing works.",
    icp: {
      description:
        "We specialise in residential roofing — re-roofs, roof replacements and roof extensions. Focus on householder applications mentioning roof works.",
      keywords: [
        "roof",
        "re-roof",
        "reroof",
        "roofing",
        "roof extension",
        "tiles",
      ],
      excludedKeywords: ["commercial", "industrial", "solar farm"],
      preferredStatuses: ["pending", "approved", "granted"],
      minProjectValueGbp: 8000,
      targetRefusals: false,
      appealServiceType: null,
    },
    letterTemplate: {
      name: "Roofing intro",
      subject: "Roofing for your planning application {{ref}}",
      bodyHtml: `<p>Your planning application mentions roof works, and I wanted to introduce our roofing team.</p>
<p>We handle re-roofs and roof alterations for homes like yours, with clear timelines and tidy site practice.</p>
${BALLPARK_HINT}
<p>If you would rather we did not contact you again, reply and we will stop.</p>`,
    },
    rateCard: {
      dayRateGbp: 380,
      crewSizeDefault: 2,
      unitRates: {
        re_roof: 140,
        general_works: 900,
        loft_conversion: 1800,
      },
      typicalWeeks: {
        re_roof: 2,
        general_works: 3,
        loft_conversion: 6,
      },
      contingencyPercent: 10,
      vatInclusive: false,
    },
    suggestedFilterKeywords: ["roof", "re-roof", "roofing"],
  },
  {
    id: "planning_consultant",
    name: "Planning consultant (appeals)",
    summary:
      "Appeal and planning consultancy for refused applications and complex cases.",
    icp: {
      description:
        "We provide planning consultancy and appeal support for refused or at-risk applications. We help applicants understand refusal reasons and next steps.",
      keywords: ["refusal", "refused", "appeal", "planning consultant"],
      excludedKeywords: ["advertisement"],
      preferredStatuses: ["refused", "refusal"],
      minProjectValueGbp: null,
      targetRefusals: true,
      appealServiceType: "planning consultant",
    },
    letterTemplate: {
      name: "Appeals intro",
      subject: "Your refused application {{ref}} — next steps",
      bodyHtml: `<p>I noticed your planning application was refused and wanted to introduce our planning consultancy.</p>
<p>We help applicants understand refusal reasons and, where appropriate, prepare a proportionate next step such as an appeal or revised scheme.</p>
<p>Any fee guidance we share is indicative only and depends on the case papers — we confirm scope after a short review.</p>
<p>If you would prefer no further contact, reply and we will close the file.</p>`,
    },
    rateCard: {
      dayRateGbp: 650,
      crewSizeDefault: 1,
      unitRates: {
        general_works: 2500,
      },
      typicalWeeks: {
        general_works: 4,
      },
      contingencyPercent: 5,
      vatInclusive: false,
    },
    suggestedFilterKeywords: ["refusal", "appeal"],
  },
];

export function getTradePlaybook(id: string): TradePlaybook | null {
  return TRADE_PLAYBOOKS.find((p) => p.id === id) ?? null;
}
