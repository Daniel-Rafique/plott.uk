/** User-facing trial length — keep in sync with STRIPE_TRIAL_DAYS default (3). */
export const TRIAL_DAYS = Number(process.env.NEXT_PUBLIC_TRIAL_DAYS ?? "3");

export function trialDaysLabel(options?: { uppercase?: boolean }): string {
  const n = TRIAL_DAYS;
  const word = n === 1 ? "day" : "days";
  const label = `${n}-${word} trial`;
  return options?.uppercase ? label.toUpperCase() : label;
}

export function freeTrialEyebrow(): string {
  return `Free ${TRIAL_DAYS}-day trial`;
}

export function trialChargeCopy(): string {
  return `Sign up free. Card required when you choose a plan — no charge during your ${TRIAL_DAYS}-day trial.`;
}

export function trialNoChargeDuringCopy(): string {
  return `No charge during your ${TRIAL_DAYS}-day trial. Cancel any time.`;
}

export function startFreeTrialLabel(): string {
  return "Start free trial";
}

export function startTrialButtonLabel(): string {
  const word = TRIAL_DAYS === 1 ? "day" : "days";
  return `Start ${TRIAL_DAYS}-${word} trial`;
}

export function freeTrialBadgeLabel(options?: { uppercase?: boolean }): string {
  const label = freeTrialEyebrow();
  return options?.uppercase ? label.toUpperCase() : label;
}

export function startTrialHeroCopy(): string {
  const word = TRIAL_DAYS === 1 ? "day" : "days";
  return `Start your ${TRIAL_DAYS}-${word} trial and draw your first polygon in under a minute. Letters and email outreach both stay behind your review step.`;
}
