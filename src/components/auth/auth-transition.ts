import { gsap } from "gsap";

export type AuthTransitionDirection = "signup" | "signin";

export const AUTH_PANEL_SELECTOR = "[data-auth-panel]";
export const AUTH_REVEAL_SELECTOR = "[data-auth-reveal]";
export const AUTH_BENEFITS_SELECTOR = "[data-auth-benefits]";
export const AUTH_TRANSITION_STORAGE_KEY = "plott-auth-transition";

const EXIT_DURATION = 0.28;
const ENTER_DURATION = 0.45;
const ENTER_STAGGER = 0.06;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function setAuthTransitionDirection(direction: AuthTransitionDirection): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AUTH_TRANSITION_STORAGE_KEY, direction);
  } catch {
    /* private browsing */
  }
}

export function consumeAuthTransitionDirection(): AuthTransitionDirection | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(AUTH_TRANSITION_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_TRANSITION_STORAGE_KEY);
    if (value === "signup" || value === "signin") return value;
  } catch {
    /* ignore */
  }
  return null;
}

export function findAuthPanel(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(AUTH_PANEL_SELECTOR);
}

function exitOffset(direction: AuthTransitionDirection): number {
  return direction === "signup" ? -24 : 24;
}

function enterOffset(direction: AuthTransitionDirection): number {
  return direction === "signup" ? 32 : -32;
}

export function animateAuthPanelExit(
  panel: HTMLElement,
  direction: AuthTransitionDirection,
): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();

  return new Promise((resolve) => {
    gsap.to(panel, {
      x: exitOffset(direction),
      opacity: 0,
      duration: EXIT_DURATION,
      ease: "power2.in",
      overwrite: "auto",
      onComplete: resolve,
    });
  });
}

export function animateAuthPanelEnter(
  panel: HTMLElement,
  direction: AuthTransitionDirection | null,
): (() => void) | void {
  const reveals = panel.querySelectorAll<HTMLElement>(AUTH_REVEAL_SELECTOR);

  if (prefersReducedMotion()) {
    gsap.set(panel, { x: 0, opacity: 1, clearProps: "transform" });
    gsap.set(reveals, { opacity: 1, y: 0 });
    return;
  }

  const ctx = gsap.context(() => {
    if (direction) {
      gsap.set(panel, { x: enterOffset(direction), opacity: 0 });
      gsap.to(panel, {
        x: 0,
        opacity: 1,
        duration: ENTER_DURATION,
        ease: "power3.out",
        overwrite: "auto",
      });
    } else {
      gsap.set(panel, { y: 12, opacity: 0 });
      gsap.to(panel, {
        y: 0,
        opacity: 1,
        duration: ENTER_DURATION,
        ease: "power3.out",
        overwrite: "auto",
      });
    }

    if (reveals.length > 0) {
      gsap.set(reveals, { opacity: 0, y: direction ? 10 : 8 });
      gsap.to(reveals, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: "power3.out",
        stagger: ENTER_STAGGER,
        delay: direction ? 0.08 : 0.05,
        overwrite: "auto",
      });
    }
  }, panel);

  return () => {
    ctx.revert();
  };
}

export function animateAuthBenefitsEnter(container: HTMLElement): () => void {
  if (prefersReducedMotion()) {
    gsap.set(container, { opacity: 1 });
    return () => undefined;
  }

  gsap.set(container, { opacity: 0.6 });
  const tween = gsap.to(container, {
    opacity: 1,
    duration: 0.3,
    ease: "power2.out",
  });

  return () => {
    tween.kill();
  };
}
