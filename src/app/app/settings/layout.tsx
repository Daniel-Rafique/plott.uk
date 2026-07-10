import Link from "next/link";
import {
  Bell,
  Building2,
  Calculator,
  CreditCard,
  Mail,
  PenLine,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

const nav = [
  { href: "/app/settings/account", label: "Account", icon: ShieldCheck },
  { href: "/app/settings/branding", label: "Branding", icon: Building2 },
  { href: "/app/settings/signature", label: "Signature", icon: PenLine },
  { href: "/app/settings/templates", label: "Templates", icon: Mail },
  { href: "/app/settings/rate-card", label: "Rate card", icon: Calculator },
  { href: "/app/settings/notifications", label: "Notifications", icon: Bell },
  { href: "/app/settings/team", label: "Team", icon: UsersRound },
  { href: "/app/settings/ai", label: "AI", icon: Sparkles },
  { href: "/app/settings/billing", label: "Billing", icon: CreditCard },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl flex-1 gap-8 overflow-x-hidden overflow-y-auto px-6 py-10 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="self-start">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500">
          Workspace settings
        </h2>
        <nav className="space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100"
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="min-w-0">{children}</section>
    </div>
  );
}
