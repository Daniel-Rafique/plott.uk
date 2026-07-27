import Image from "next/image";
import { Check, KeyRound, LockKeyhole } from "lucide-react";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdScriptProps,
  publicPageMetadata,
} from "@/lib/seo";
import { RevealGroup, RevealHeading } from "@/lib/animation/reveal";
import { StackingSections } from "@/lib/animation/stacking-sections";
import { MCP_CAPABILITIES } from "@/lib/marketing/images";
import { McpHero } from "./mcp-hero";

const MCP_URL = "https://plott.uk/api/mcp";

export const metadata = publicPageMetadata({
  title: "Plott MCP | UK planning intelligence for AI assistants",
  description:
    "Connect Plott to Claude, ChatGPT, Cursor and compatible MCP clients. Search UK planning applications and run workspace workflows through secure OAuth.",
  path: "/mcp",
  openGraphTitle: "Use Plott from Claude, ChatGPT and Cursor",
  openGraphDescription:
    "Connect your AI workspace to UK planning intelligence, pipeline tools, letters and approved outreach with Plott's OAuth-secured remote MCP.",
});

const mcpJsonLd = [
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Plott MCP", path: "/mcp" },
  ]),
  faqJsonLd([
    {
      question: "What is the Plott MCP?",
      answer:
        "Plott MCP is a secure remote Model Context Protocol server that lets compatible AI clients use Plott planning intelligence and workspace tools.",
    },
    {
      question: "Which AI clients can connect to Plott MCP?",
      answer:
        "Plott uses standards-based remote MCP and OAuth, designed for compatible clients including Claude, ChatGPT and Cursor.",
    },
    {
      question: "Can an MCP client access every Plott workspace?",
      answer:
        "No. During authorization you select one workspace and approve explicit permissions. Access can be revoked and membership is checked on every request.",
    },
  ]),
];

const capabilities = [
  {
    number: "01",
    kicker: "Search & research",
    title: "Planning intelligence",
    copy: "Search nearby applications, inspect details and research applicants across UK planning authorities.",
    image: MCP_CAPABILITIES.planning,
    accent: "from-emerald-900/30",
  },
  {
    number: "02",
    kicker: "Same workspace",
    title: "Workspace workflows",
    copy: "Work with pipeline leads, pinned applications, saved searches, reminders and letter drafts.",
    image: MCP_CAPABILITIES.workspace,
    accent: "from-blue-900/30",
  },
  {
    number: "03",
    kicker: "Skills & prompts",
    title: "Guided AI workflows",
    copy: "Compatible clients discover Plott skills for research, lead qualification and compliant outreach. Tools and prompts remain available everywhere.",
    image: MCP_CAPABILITIES.guided,
    accent: "from-amber-900/30",
  },
];

export default function McpPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScriptProps(mcpJsonLd)}
      />
      <main className="flex-1 bg-white">
        <StackingSections>
          <McpHero />

          <section
            data-stack
            data-bg="#ffffff"
            className="relative bg-white px-6 py-24 md:py-32"
          >
            <RevealGroup className="mx-auto max-w-7xl" stagger={0.08}>
              <p data-reveal className="editorial-chapter-label text-brand-dark">
                What you can do
              </p>
              <RevealHeading
                as="h2"
                className="mt-5 max-w-4xl font-[family-name:var(--font-display)] text-[clamp(38px,5vw,64px)] font-normal leading-[1.05] tracking-tight text-zinc-950"
              >
                Your planning workspace, available in conversation.
              </RevealHeading>
              <div className="mt-14 grid gap-6 md:grid-cols-3">
                {capabilities.map(
                  ({ number, kicker, title, copy, image, accent }) => (
                    <article
                      key={title}
                      data-reveal
                      className="relative min-h-[26rem] overflow-hidden rounded-2xl md:min-h-[30rem]"
                    >
                      <div className="absolute inset-0">
                        <Image
                          src={image.src}
                          alt={image.alt}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover"
                        />
                      </div>
                      <div
                        aria-hidden
                        className={`pointer-events-none absolute inset-0 bg-gradient-to-t ${accent} via-black/50 to-transparent`}
                      />
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent"
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute right-5 top-5 select-none font-[family-name:var(--font-display)] text-[clamp(88px,12vw,140px)] font-normal leading-none tracking-tighter text-white/[0.08]"
                      >
                        {number}
                      </span>
                      <div className="relative z-10 flex min-h-[26rem] flex-col justify-end px-6 pb-8 pt-20 md:min-h-[30rem] md:px-7 md:pb-9">
                        <div className="flex items-baseline gap-3">
                          <span className="font-[family-name:var(--font-display)] text-[40px] leading-none text-white/50">
                            {number}
                          </span>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70">
                            {kicker}
                          </p>
                        </div>
                        <h3 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(26px,2.4vw,34px)] font-normal leading-[1.1] tracking-tight text-white">
                          {title}
                        </h3>
                        <p className="mt-4 text-[14px] leading-relaxed text-white/80">
                          {copy}
                        </p>
                      </div>
                    </article>
                  ),
                )}
              </div>
            </RevealGroup>
          </section>

          <section
            data-stack
            data-bg="#fafaf9"
            className="relative bg-stone-50 px-6 py-24 md:py-32"
          >
            <RevealGroup
              className="mx-auto grid max-w-6xl gap-16 lg:grid-cols-[0.9fr_1.1fr]"
              stagger={0.08}
            >
              <div>
                <p
                  data-reveal
                  className="editorial-chapter-label text-zinc-500"
                >
                  Connect in three steps
                </p>
                <RevealHeading
                  as="h2"
                  className="mt-5 font-[family-name:var(--font-display)] text-[clamp(38px,5vw,64px)] font-normal leading-[1.05] text-zinc-950"
                >
                  One URL. Secure OAuth. Your workspace.
                </RevealHeading>
                <p
                  data-reveal
                  className="mt-6 max-w-lg text-[15px] leading-relaxed text-zinc-600"
                >
                  No API key copying is required. Your MCP client discovers
                  Plott&rsquo;s OAuth service and opens a secure browser consent
                  flow.
                </p>
              </div>
              <ol className="space-y-5">
                {[
                  [
                    "Add the remote server",
                    `Use ${MCP_URL} as the MCP server URL in your compatible client.`,
                  ],
                  [
                    "Sign in and choose a workspace",
                    "Plott shows the requested permissions and asks which workspace the client may use.",
                  ],
                  [
                    "Start asking",
                    "Try “Find planning applications in Brixton” or ask Plott to inspect and organise a lead.",
                  ],
                ].map(([title, copy], index) => (
                  <li
                    key={title}
                    data-reveal
                    className="flex gap-5 rounded-2xl border border-zinc-200 bg-white p-6"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold text-zinc-950">{title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                        {copy}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </RevealGroup>
          </section>

          <section
            data-stack
            data-bg="#ffffff"
            className="relative bg-white px-6 py-24 md:py-32"
          >
            <RevealGroup
              className="mx-auto grid max-w-6xl gap-12 rounded-3xl bg-zinc-950 p-8 text-white md:grid-cols-2 md:p-14"
              stagger={0.07}
            >
              <div data-reveal>
                <LockKeyhole className="h-8 w-8 text-brand-light" aria-hidden />
                <RevealHeading
                  as="h2"
                  className="mt-6 font-[family-name:var(--font-display)] text-4xl font-normal"
                >
                  Permissioned by design.
                </RevealHeading>
                <p className="mt-5 text-sm leading-relaxed text-zinc-400">
                  The MCP uses OAuth 2.1 with PKCE, short-lived access tokens,
                  rotating refresh tokens and workspace-bound authorization.
                </p>
              </div>
              <ul className="space-y-4 text-sm text-zinc-300">
                {[
                  "Select exactly one workspace during consent",
                  "Approve explicit read and write permissions",
                  "Revoke a client connection at any time",
                  "Membership and subscription access rechecked at runtime",
                  "Billing, team administration and account deletion excluded",
                ].map((item) => (
                  <li key={item} data-reveal className="flex items-start gap-3">
                    <Check
                      className="mt-0.5 h-4 w-4 shrink-0 text-brand-light"
                      aria-hidden
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </RevealGroup>
          </section>

          <section
            data-stack
            data-bg="#ffffff"
            className="relative border-t border-zinc-200 bg-white px-6 py-20 text-center"
          >
            <RevealGroup className="mx-auto max-w-2xl" stagger={0.08}>
              <KeyRound
                data-reveal
                className="mx-auto h-7 w-7 text-brand"
                aria-hidden
              />
              <RevealHeading
                as="h2"
                className="mt-5 font-[family-name:var(--font-display)] text-4xl font-normal text-zinc-950"
              >
                Ready to connect?
              </RevealHeading>
              <p
                data-reveal
                className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-600"
              >
                Add the Plott MCP URL to your client, authorize your workspace
                and start working with planning data in conversation.
              </p>
              <code
                data-reveal
                className="mt-7 inline-block rounded-full bg-zinc-100 px-6 py-3 text-sm text-zinc-800"
              >
                {MCP_URL}
              </code>
            </RevealGroup>
          </section>
        </StackingSections>
      </main>
    </>
  );
}
