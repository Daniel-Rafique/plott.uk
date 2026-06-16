"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { scheduleScrollTriggerRefresh } from "./scroll-trigger-refresh";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Headline text reveal. Splits the element's text into word-sized spans and
 * slides them up from below the baseline as the element enters the viewport.
 *
 * Put the ref on the heading element itself. Any child text nodes are split
 * into `<span class="text-reveal-word">` blocks; existing child elements (e.g.
 * inline `<span>` or `<em>` for italic / accent spans) are preserved and also
 * translated as a single unit.
 *
 * Respects prefers-reduced-motion by showing the final state immediately.
 */
export function useTextReveal<T extends HTMLElement>(start = "top 85%") {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const words = splitIntoWords(el);
    if (words.length === 0) return;

    if (prefersReduced) {
      gsap.set(words, { y: 0, opacity: 1 });
      return;
    }

    gsap.set(words, { yPercent: 110, opacity: 0, force3D: true });

    const ctx = gsap.context(() => {
      gsap.to(words, {
        yPercent: 0,
        opacity: 1,
        duration: 0.9,
        stagger: 0.04,
        ease: "power3.out",
        scrollTrigger: {
          trigger: el,
          start,
          toggleActions: "play none none none",
        },
      });
    }, el);

    const cancelRefresh = scheduleScrollTriggerRefresh();

    return () => {
      cancelRefresh();
      ctx.revert();
    };
  }, [start]);

  return ref;
}

/**
 * Split an element's text content into inline-block word spans wrapped in an
 * overflow-hidden "line" wrapper so the y-translated words are clipped, giving
 * the reveal a classic typographic mask effect.
 *
 * Preserves nested inline elements (e.g. `<span class="italic">`) by treating
 * them as a single "word unit".
 *
 * Exported for scroll-scrubbed timelines (e.g. about hero) that need the same
 * DOM structure with custom ScrollTrigger wiring.
 */
export function splitIntoWords(el: HTMLElement): HTMLElement[] {
  if (el.dataset.textRevealSplit === "1") {
    return Array.from(
      el.querySelectorAll<HTMLElement>(".text-reveal-word"),
    );
  }

  const nodes = Array.from(el.childNodes);
  const wordEls: HTMLElement[] = [];
  el.textContent = "";

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      const segments = text.split(/(\s+)/);
      for (const seg of segments) {
        if (seg.length === 0) continue;
        if (/^\s+$/.test(seg)) {
          el.appendChild(document.createTextNode(seg));
          continue;
        }
        const line = document.createElement("span");
        line.className = "text-reveal-line";
        line.style.display = "inline-block";
        line.style.overflow = "hidden";
        line.style.verticalAlign = "top";
        line.style.lineHeight = "inherit";
        line.style.paddingBottom = "0.15em";

        const word = document.createElement("span");
        word.className = "text-reveal-word";
        word.style.display = "inline-block";
        word.style.willChange = "transform, opacity";
        word.textContent = seg;

        line.appendChild(word);
        el.appendChild(line);
        wordEls.push(word);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Keep inline element wrappers (e.g. italic accent spans) as-is, but
      // wrap them in the same overflow-line + word structure.
      const child = node as HTMLElement;
      const line = document.createElement("span");
      line.className = "text-reveal-line";
      line.style.display = child.style.display === "block" ? "block" : "inline-block";
      line.style.overflow = "hidden";
      line.style.lineHeight = "inherit";
      line.style.verticalAlign = "top";
      line.style.paddingBottom = "0.15em";

      const word = document.createElement("span");
      word.className = "text-reveal-word";
      word.style.display = "inline-block";
      word.style.willChange = "transform, opacity";
      word.appendChild(child);

      line.appendChild(word);
      el.appendChild(line);
      wordEls.push(word);
    }
  }

  el.dataset.textRevealSplit = "1";
  return wordEls;
}
