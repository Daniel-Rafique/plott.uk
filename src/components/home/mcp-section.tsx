"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useGsapReveal } from "@/lib/animation/use-gsap-reveal";
import { useTextReveal } from "@/lib/animation/use-text-reveal";
import { MCP_HERO } from "@/lib/marketing/images";

const CAPABILITIES = [
  {
    number: "01",
    title: "Search live applications",
    description:
      "Nearby cases, site context, and applicant details from Claude, ChatGPT, or Cursor.",
  },
  {
    number: "02",
    title: "Drive the same workspace",
    description:
      "Saved searches, pipeline leads, reminders, and letter drafts stay in sync.",
  },
  {
    number: "03",
    title: "Scoped OAuth access",
    description:
      "One workspace at a time. Explicit permissions, revocable whenever you need.",
  },
] as const;

export function McpSection() {
  const ref = useGsapReveal<HTMLDivElement>({ stagger: 0.07, start: "top 85%" });
  const headingRef = useTextReveal<HTMLHeadingElement>();

  return (
    <section
      data-stack
      data-bg="#0a0a0a"
      className="relative flex min-h-[100svh] items-end overflow-hidden bg-zinc-950 text-white"
    >
      <div className="absolute inset-0">
        <Image
          src={MCP_HERO.src}
          alt={MCP_HERO.alt}
          fill
          sizes="100vw"
          className="object-cover object-center"
          priority={false}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/35"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/25 to-transparent"
        />
      </div>

      <div
        ref={ref}
        className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-16 pt-32 md:pb-20 md:pt-40"
      >
        <div className="max-w-3xl">
          <p data-reveal className="editorial-chapter-label text-brand-light/80">
            MCP
          </p>
          <h2
            ref={headingRef}
            className="mt-6 font-[family-name:var(--font-display)] text-[clamp(36px,5vw,68px)] font-normal leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]"
          >
            Use Plott from the tools you already open.
          </h2>
          <p
            data-reveal
            className="mt-6 max-w-xl text-[15px] leading-relaxed text-zinc-200/90"
          >
            Connect Claude, ChatGPT, or Cursor to live UK planning data and your
            team workspace over remote MCP.
          </p>
        </div>

        <ul className="mt-14 grid grid-cols-1 gap-0 border-t border-white/15 md:grid-cols-3">
          {CAPABILITIES.map((item) => (
            <li
              key={item.number}
              data-reveal
              className="border-b border-white/15 py-7 md:border-b-0 md:border-r md:px-8 md:py-9 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <p className="editorial-chapter-label text-brand-light/70">
                {item.number}
              </p>
              <h3 className="mt-4 font-[family-name:var(--font-display)] text-[22px] font-normal leading-tight tracking-tight text-white md:text-[24px]">
                {item.title}
              </h3>
              <p className="mt-3 text-[14px] leading-relaxed text-zinc-300">
                {item.description}
              </p>
            </li>
          ))}
        </ul>

        <div
          data-reveal
          className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <Link
              href="/mcp"
              className="group inline-flex items-center gap-2 self-start rounded-full border border-white bg-white px-7 py-3.5 text-[13px] font-medium text-zinc-950 transition hover:border-brand-light hover:bg-brand-light"
            >
              Connect Plott MCP
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                strokeWidth={1.5}
                aria-hidden
              />
            </Link>
            <code className="text-[12px] tracking-wide text-zinc-400">
              https://plott.uk/api/mcp
            </code>
          </div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-zinc-500">
            Photo: {MCP_HERO.credit.name}
          </p>
        </div>
      </div>
    </section>
  );
}
