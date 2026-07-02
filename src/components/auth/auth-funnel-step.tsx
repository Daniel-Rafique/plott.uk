type Props = {
  step: number;
  total: number;
  label: string;
  hint?: string;
};

export function AuthFunnelStep({ step, total, label, hint }: Props) {
  return (
    <div className="mb-8 border-b border-zinc-200/80 pb-4">
      <p className="editorial-chapter-label text-brand-dark">
        Step {step} of {total} — {label}
      </p>
      {hint ? (
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}
