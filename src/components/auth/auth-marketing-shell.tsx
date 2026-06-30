import type { ReactNode } from "react";
import {
  AuthMarketingShellClient,
  type AuthMarketingShellProps,
} from "@/components/auth/auth-marketing-shell-client";

export type { AuthMarketingShellProps };

export function AuthMarketingShell(props: AuthMarketingShellProps) {
  return <AuthMarketingShellClient {...props} />;
}
