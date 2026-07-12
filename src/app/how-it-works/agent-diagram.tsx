/**
 * Reusable “autonomous agent” workflow list for the How it works page.
 */
export const AGENT_STEPS = [
  {
    number: "01",
    title: "Scan saved searches",
    description: "Every 48 hours, re-run all saved polygons against live planning data",
  },
  {
    number: "02",
    title: "Detect new applications",
    description:
      "Compare results against your seen history, isolate genuinely new leads",
  },
  {
    number: "03",
    title: "Enrich & estimate",
    description:
      "Resolve contacts and, where your rate card allows, attach an indicative ballpark",
  },
  {
    number: "04",
    title: "Queue outreach",
    description:
      "Prepare letter and email drafts for human review before anything is sent",
  },
  {
    number: "05",
    title: "Land in Pipeline",
    description:
      "Track each lead by stage, work type, and assignee — with teammate notifications",
  },
  {
    number: "06",
    title: "Deliver digest",
    description:
      "Weekly summary with enriched leads and approved outreach options",
  },
] as const;

export const AGENT_FEATURES = [
  {
    title: "Continuous monitoring",
    description: "searches run automatically every 48 hours",
  },
  {
    title: "Smart change detection",
    description: "only genuinely new leads, no duplicates",
  },
  {
    title: "Pre-enriched results",
    description: "contacts resolved before they reach you",
  },
  {
    title: "Ballpark on the lead",
    description: "indicative cost and programme when your rates are set",
  },
  {
    title: "Pipeline handoff",
    description: "assign teammates and track stage from first contact",
  },
  {
    title: "Weekly digest emails",
    description: "summary delivered straight to your inbox",
  },
] as const;

export function AgentDiagram() {
  return (
    <div className="w-full">
      <div className="divide-y divide-zinc-800/90 border-y border-zinc-700/80">
        {AGENT_STEPS.map((step) => (
          <div
            key={step.number}
            className="grid grid-cols-[auto_1fr] gap-6 py-6"
          >
            <span className="font-[family-name:var(--font-display)] text-[32px] leading-none text-zinc-400">
              {step.number}
            </span>
            <div>
              <p className="text-[15px] font-medium text-white">{step.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
