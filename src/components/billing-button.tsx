import Link from "next/link";

export function BillingButton() {
  return (
    <Link
      href="/app/settings/billing"
      className="rounded-full border border-zinc-300 bg-white px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 xl:px-5 xl:py-2.5 xl:text-[11px] xl:tracking-[0.22em]"
    >
      Manage billing
    </Link>
  );
}
