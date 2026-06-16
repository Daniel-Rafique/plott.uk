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
    title: "Enrich contacts",
    description: "Run the full enrichment cascade on each new application",
  },
  {
    number: "04",
    title: "Deliver digest",
    description: "Weekly summary with enriched leads ready to action",
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
