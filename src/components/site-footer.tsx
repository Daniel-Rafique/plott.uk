import Link from "next/link";
import Image from "next/image";

type LinkItem = { href: string; label: string; external?: boolean };

const columns: { title: string; links: LinkItem[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/resources", label: "Resources" },
      { href: "#features", label: "Features" },
      { href: "/app/dashboard", label: "Open app" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/legal/subprocessors", label: "Sub-processors" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/support", label: "Support" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer
      data-bg="#0a0a0a"
      className="relative z-50 bg-zinc-950 text-zinc-400"
    >
      <div className="mx-auto w-full max-w-7xl px-6 pt-24 pb-10">
        <div className="grid gap-14 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div className="max-w-sm">
            <Link
              href="/"
              className="inline-block"
            >
              <Image 
                src="/logo-8.png" 
                alt="Plott" 
                width={120} 
                height={32} 
                className="h-8 w-auto object-contain brightness-0 invert" 
              />
            </Link>
            <p className="mt-5 text-[13px] leading-relaxed text-zinc-400">
              Map-first planning intelligence for the UK construction, property
              and planning sector. Built in Britain, covering all 337 local
              planning authorities.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="editorial-chapter-label text-zinc-500">
                {col.title}
              </h3>
              <ul className="mt-5 space-y-3 text-[13px]">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-300 transition-colors hover:text-white"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-zinc-300 transition-colors hover:text-white"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-20 editorial-hairline-dark pt-8">
          <div className="mt-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-[11px] text-zinc-500">
              © {new Date().getFullYear()} Plott · Built in the UK
            </p>
            <p className="text-[11px] text-zinc-500">
              hello@plott.uk
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
