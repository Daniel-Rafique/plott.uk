/**
 * Marketing / CTA copy for signup and pricing.
 * Free trials are disabled via STRIPE_TRIAL_DAYS=0 in Vercel — do not promise a trial here.
 */

export function freeTrialEyebrow(): string {
  return "Cancel anytime";
}

export function trialChargeCopy(): string {
  return "Create your account free. Card required when you choose a plan — billed at checkout. Cancel any time.";
}

export function trialNoChargeDuringCopy(): string {
  return "Billed at checkout. Cancel any time.";
}

export function startFreeTrialLabel(): string {
  return "Get started";
}

export function startTrialButtonLabel(): string {
  return "Get started";
}

export function freeTrialBadgeLabel(options?: { uppercase?: boolean }): string {
  const label = freeTrialEyebrow();
  return options?.uppercase ? label.toUpperCase() : label;
}

export function startTrialHeroCopy(): string {
  return "Choose a plan and draw your first polygon in under a minute. Letters and email outreach both stay behind your review step.";
}
