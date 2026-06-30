"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

type AuthPageEvent = "auth_signup_page_viewed" | "auth_signin_page_viewed";

export function AuthPageAnalytics({ event }: { event: AuthPageEvent }) {
  useEffect(() => {
    posthog.capture(event);
  }, [event]);

  return null;
}
