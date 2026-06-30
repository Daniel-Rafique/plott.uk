"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ComponentProps, type MouseEvent } from "react";
import {
  animateAuthPanelExit,
  findAuthPanel,
  prefersReducedMotion,
  setAuthTransitionDirection,
  type AuthTransitionDirection,
} from "@/components/auth/auth-transition";

type Props = Omit<ComponentProps<typeof Link>, "href" | "onClick"> & {
  href: string;
  direction: AuthTransitionDirection;
};

export function AuthTransitionLink({
  href,
  direction,
  className,
  children,
  ...rest
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    if (pending) return;

    if (prefersReducedMotion()) {
      setAuthTransitionDirection(direction);
      router.push(href);
      return;
    }

    const panel = findAuthPanel();
    if (!panel) {
      setAuthTransitionDirection(direction);
      router.push(href);
      return;
    }

    setPending(true);
    setAuthTransitionDirection(direction);
    await animateAuthPanelExit(panel, direction);
    router.push(href);
  }

  return (
    <Link
      href={href}
      onClick={(event) => void handleClick(event)}
      aria-busy={pending || undefined}
      className={
        pending
          ? `${className ?? ""} pointer-events-none opacity-70`.trim()
          : className
      }
      {...rest}
    >
      {children}
    </Link>
  );
}
