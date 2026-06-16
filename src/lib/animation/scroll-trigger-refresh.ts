import { ScrollTrigger } from "gsap/ScrollTrigger";

let refreshRaf = 0;

export const DESKTOP_FINE_POINTER_QUERY =
  "(min-width: 1024px) and (hover: hover) and (pointer: fine)";

export function scheduleScrollTriggerRefresh(): () => void {
  if (typeof window === "undefined") return () => {};
  if (refreshRaf) window.cancelAnimationFrame(refreshRaf);
  refreshRaf = window.requestAnimationFrame(() => {
    refreshRaf = 0;
    ScrollTrigger.refresh();
  });
  return () => {
    if (!refreshRaf) return;
    window.cancelAnimationFrame(refreshRaf);
    refreshRaf = 0;
  };
}
