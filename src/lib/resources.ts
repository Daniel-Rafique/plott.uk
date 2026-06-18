export type ResourcePage = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  directAnswer: string;
  updatedAt: string;
  readTime: string;
  sections: {
    title: string;
    body: string;
    bullets?: string[];
  }[];
  faqs: {
    question: string;
    answer: string;
  }[];
  cta: {
    title: string;
    body: string;
  };
};

export const resourcePages: ResourcePage[] = [
  {
    slug: "find-uk-planning-application-leads",
    title: "How to find UK planning application leads",
    description:
      "A practical guide to finding high-intent construction and property leads from UK planning applications.",
    eyebrow: "Planning lead generation",
    directAnswer:
      "The fastest way to find UK planning application leads is to monitor local authority planning registers by geography, filter for the work you can actually deliver, then enrich each application with applicant, agent and property context before starting outreach.",
    updatedAt: "2026-06-18",
    readTime: "6 min read",
    sections: [
      {
        title: "Start with geography, not keywords",
        body:
          "Planning applications are inherently local. Builders, architects and consultants usually win work because they understand a patch. Start by defining the boroughs, postcodes or radius where you can realistically quote and deliver.",
        bullets: [
          "Track all relevant local planning authorities in your operating area.",
          "Segment by decision stage, application type and project value signals.",
          "Save searches so new applications arrive automatically instead of relying on ad hoc manual checks.",
        ],
      },
      {
        title: "Prioritise signals that imply buying intent",
        body:
          "A planning application tells you that someone is preparing to spend money. The strongest leads are applications where your service is required after approval or during pre-construction.",
        bullets: [
          "Extensions and loft conversions for residential builders.",
          "Change-of-use and fit-out applications for commercial contractors.",
          "Refusals and appeals for planning consultants and architects.",
        ],
      },
      {
        title: "Enrich before you contact",
        body:
          "Raw planning data is rarely enough for confident outreach. Check the applicant, agent, property owner and project context before sending a letter or email so the message is specific and useful.",
      },
    ],
    faqs: [
      {
        question: "Are UK planning applications public data?",
        answer:
          "Yes. Local planning authorities publish planning applications and associated documents through public registers, but teams still need to handle any personal data lawfully and proportionately.",
      },
      {
        question: "What types of businesses use planning application leads?",
        answer:
          "Builders, architects, planning consultants, surveyors, glazing firms, roofing companies, landscapers and property services teams can all use planning applications to identify upcoming projects.",
      },
      {
        question: "How often should I check for new planning leads?",
        answer:
          "For competitive trades, daily or weekly saved-search monitoring is better than monthly manual checks because the first useful outreach often wins the conversation.",
      },
    ],
    cta: {
      title: "Get the planning lead checklist",
      body:
        "A short checklist for qualifying applications, enriching contacts and starting compliant outreach.",
    },
  },
  {
    slug: "contact-planning-applicants-legally",
    title: "How to contact planning applicants legally in the UK",
    description:
      "How UK construction and property teams can approach planning applicants with privacy-aware, useful outreach.",
    eyebrow: "Compliant outreach",
    directAnswer:
      "To contact planning applicants legally in the UK, use a lawful basis, keep the message relevant to the planning application, identify your business clearly, avoid excessive personal data, and provide an easy way to opt out of future contact.",
    updatedAt: "2026-06-18",
    readTime: "7 min read",
    sections: [
      {
        title: "Use relevance as the guardrail",
        body:
          "The safest outreach is specific to the live planning matter. A generic marketing blast is harder to justify than a short, helpful note explaining why your service is relevant to the proposed work.",
        bullets: [
          "Reference the planning application or project type.",
          "Explain why your service is relevant now.",
          "Avoid implying a relationship with the council or applicant.",
        ],
      },
      {
        title: "Prefer letters for sensitive applicant contexts",
        body:
          "Postal outreach can be a proportionate first channel where the published record includes a site or correspondence address. Email outreach needs extra care, especially where the recipient is an individual rather than a business address.",
      },
      {
        title: "Keep an audit trail",
        body:
          "Record the source, purpose, message, date and opt-out status for each outreach attempt. That audit trail helps prove your process is controlled and respectful.",
        bullets: [
          "Store the application reference and source URL.",
          "Keep a copy of the message sent.",
          "Honour suppression and unsubscribe requests promptly.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can I email a planning applicant?",
        answer:
          "It depends on the recipient, source and purpose. B2B addresses may be easier to justify than personal email addresses, but you still need a lawful basis, clear identification and an opt-out route.",
      },
      {
        question: "Is legitimate interest enough for planning outreach?",
        answer:
          "Legitimate interest can support relevant B2B outreach, but it requires a balancing test and does not remove PECR or UK GDPR duties.",
      },
      {
        question: "Should outreach include an unsubscribe option?",
        answer:
          "Yes. Even for one-to-one outreach, giving a simple opt-out route is good practice and helps keep future contact compliant.",
      },
    ],
    cta: {
      title: "Get the compliant outreach template",
      body:
        "Use a privacy-aware planning outreach structure for letters and cautious B2B email follow-up.",
    },
  },
  {
    slug: "win-extension-work",
    title: "Best ways for builders to win extension work",
    description:
      "How builders can identify extension projects earlier and turn planning applications into useful conversations.",
    eyebrow: "Builder growth playbook",
    directAnswer:
      "Builders win more extension work by monitoring new planning applications in their patch, contacting homeowners before competitors do, personalising outreach around the proposed build, and following up with clear proof of similar local projects.",
    updatedAt: "2026-06-18",
    readTime: "5 min read",
    sections: [
      {
        title: "Find projects before they reach tender sites",
        body:
          "By the time a homeowner posts publicly for quotes, several builders may already be competing. Planning applications reveal intent earlier, especially for extensions, loft conversions and outbuildings.",
      },
      {
        title: "Make outreach useful, not pushy",
        body:
          "The best first message feels timely and specific. Reference the type of work, explain relevant experience, and make it easy for the homeowner to ask for advice or a quote.",
        bullets: [
          "Mention similar extension work you have completed nearby.",
          "Offer a short planning-to-build checklist.",
          "Avoid scare tactics or exaggerated claims.",
        ],
      },
      {
        title: "Follow up around decision milestones",
        body:
          "An application being submitted, validated, approved or refused creates different needs. Saved-search alerts help builders follow up when the applicant is most likely to be planning the next step.",
      },
    ],
    faqs: [
      {
        question: "When should a builder contact someone about an extension?",
        answer:
          "The most useful points are after validation, around approval, or after a refusal if you can help redesign or re-scope the project.",
      },
      {
        question: "What should a builder include in a first outreach letter?",
        answer:
          "Include who you are, why the proposed work is relevant to your experience, local proof, a simple next step and a clear way not to be contacted again.",
      },
      {
        question: "Do planning leads replace referrals?",
        answer:
          "No. Planning leads complement referrals by giving builders a reliable way to find high-intent local projects before they are widely advertised.",
      },
    ],
    cta: {
      title: "Get the builder lead checklist",
      body:
        "Qualify extension applications, time your outreach and follow up without sounding generic.",
    },
  },
];

export function resourceBySlug(slug: string) {
  return resourcePages.find((page) => page.slug === slug) ?? null;
}
