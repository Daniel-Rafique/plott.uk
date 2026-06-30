type Props = {
  step: number;
  total: number;
  label: string;
  hint?: string;
};

export function AuthFunnelStep({ step, total, label, hint }: Props) {
  return (
    <div className="mb-6 rounded-lg border border-brand-light/30 bg-brand/5 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-dark">
        Step {step} of {total} — {label}
      </p>
      {hint ? (
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">{hint}</p>
      ) : null}
    </div>
  );
}
