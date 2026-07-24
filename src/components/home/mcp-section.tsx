import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Cable,
  Search,
  ShieldCheck,
} from "lucide-react";

const capabilities = [
  {
    icon: Search,
    title: "Search planning data",
    description:
      "Find applications, inspect sites and research applicants from your AI workspace.",
  },
  {
    icon: Bot,
    title: "Run Plott workflows",
    description:
      "Manage leads, saved searches, reminders, letters and approved outreach.",
  },
  {
    icon: ShieldCheck,
    title: "OAuth-secured",
    description:
      "Every connection is scoped to one workspace, with explicit permissions and revocable access.",
  },
];

export function McpSection() {
  return (
    <section
      data-stack
      data-bg="#0a0a0a"
      className="relative flex min-h-[100svh] items-center overflow-hidden bg-zinc-950 py-28 text-white md:py-36"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 70% 30%, rgba(63, 141, 111, 0.32), transparent 38%)",
        }}
      />
      <div className="relative mx-auto grid w-full max-w-7xl gap-16 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-light/30 bg-brand/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-light">
            <Cable className="h-4 w-4" aria-hidden />
            Remote MCP now available
          </div>
          <h2 className="mt-8 max-w-3xl font-[family-name:var(--font-display)] text-[clamp(42px,6vw,78px)] font-normal leading-[1.02] tracking-tight">
            Bring Plott into your AI workspace.
          </h2>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-zinc-300 md:text-lg">
            Connect Claude, ChatGPT, Cursor and other compatible MCP clients to
            live UK planning intelligence and your Plott workflows—without
            keeping the dashboard open.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/mcp"
              className="group inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-brand-light"
            >
              Connect Plott MCP
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <code className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-5 py-3 text-xs text-zinc-300">
              https://plott.uk/api/mcp
            </code>
          </div>
        </div>

        <div className="grid gap-4">
          {capabilities.map(({ icon: Icon, title, description }) => (
            <article
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.055] p-6 backdrop-blur-sm"
            >
              <div className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/25 text-brand-light">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                    {description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
