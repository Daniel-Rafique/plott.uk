"use client";

/**
 * Drop-in wrappers that hook up motion to server-rendered content without
 * converting the whole page to a client component. Import these where you
 * need scroll-reveal behaviour inside an RSC tree.
 */

import { createElement, type ComponentPropsWithoutRef, type ElementType } from "react";
import { useGsapReveal } from "./use-gsap-reveal";
import { useTextReveal } from "./use-text-reveal";

type RevealGroupProps<T extends ElementType> = {
  as?: T;
  selector?: string;
  stagger?: number;
  y?: number;
  duration?: number;
  start?: string;
  batch?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, "ref" | "as">;

/**
 * Wraps children and reveals any descendant with `data-reveal` as it enters
 * the viewport. Elements without `data-reveal` render normally.
 */
export function RevealGroup<T extends ElementType = "div">({
  as,
  selector,
  stagger,
  y,
  duration,
  start,
  batch,
  children,
  ...rest
}: RevealGroupProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useGsapReveal<HTMLElement>({
    selector,
    stagger,
    y,
    duration,
    start,
    batch,
  });
  return createElement(Tag, { ref, ...rest }, children);
}

type RevealHeadingProps<T extends ElementType> = {
  as?: T;
  start?: string;
} & Omit<ComponentPropsWithoutRef<T>, "ref" | "as">;

/**
 * Word-by-word scroll reveal for display headings. Wraps each word in an
 * overflow-hidden mask and slides it up from below the baseline.
 */
export function RevealHeading<T extends ElementType = "h2">({
  as,
  start,
  children,
  ...rest
}: RevealHeadingProps<T>) {
  const Tag = (as ?? "h2") as ElementType;
  const ref = useTextReveal<HTMLElement>(start);
  return createElement(Tag, { ref, ...rest }, children);
}
