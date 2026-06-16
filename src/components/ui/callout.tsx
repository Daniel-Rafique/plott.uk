/**
 * Editorial callouts — the monochrome replacement for amber/yellow warning
 * boxes that were visually jarring against the rest of the site. Severity is
 * communicated through the weight of a left hairline and a muted icon rather
 * than colour fills.
 *
 *   <Callout variant="info">       <- hairline zinc-300
 *   <Callout variant="warning">    <- hairline zinc-500
 *   <Callout variant="destructive"><- hairline zinc-900
 *
 * Optionally pass `label` (chapter-label text) and `title` (display heading).
 */

import { Info, AlertCircle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "info" | "warning" | "destructive";

const VARIANT_STYLES: Record<Variant, { bar: string; icon: string; Icon: typeof Info }> = {
  info: {
    bar: "border-zinc-300",
    icon: "text-zinc-500",
    Icon: Info,
  },
  warning: {
    bar: "border-zinc-500",
    icon: "text-zinc-700",
    Icon: AlertCircle,
  },
  destructive: {
    bar: "border-zinc-900",
    icon: "text-zinc-900",
    Icon: Ban,
  },
};

export function Callout({
  variant = "info",
  label,
  title,
  icon,
  children,
  actions,
  className,
}: {
  variant?: Variant;
  /** Small chapter-label text rendered above the title (e.g. "Property ownership lookup"). */
  label?: React.ReactNode;
  /** Optional bold heading. */
  title?: React.ReactNode;
  /** Override the default lucide icon. Pass `null` to hide the icon entirely. */
  icon?: React.ReactNode | null;
  /** Body copy — usually a paragraph or a short list. */
  children?: React.ReactNode;
  /** Action row rendered below the body (buttons, links, etc.). */
  actions?: React.ReactNode;
  className?: string;
}) {
  const styles = VARIANT_STYLES[variant];
  const IconCmp = styles.Icon;
  const showIcon = icon !== null;

  return (
    <div
      className={cn(
        "border-l-2 bg-stone-50 px-4 py-3",
        styles.bar,
        className,
      )}
      role={variant === "destructive" ? "alert" : "note"}
    >
      <div className="flex items-start gap-3">
        {showIcon ? (
          <span className={cn("mt-[2px] shrink-0", styles.icon)}>
            {icon ?? <IconCmp className="h-4 w-4" aria-hidden />}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {label ? (
            <div className="editorial-chapter-label text-zinc-500">{label}</div>
          ) : null}
          {title ? (
            <div
              className={cn(
                "text-sm font-medium text-zinc-900",
                label ? "mt-1" : "",
              )}
            >
              {title}
            </div>
          ) : null}
          {children ? (
            <div
              className={cn(
                "text-[13px] leading-relaxed text-zinc-600",
                label || title ? "mt-1.5" : "",
              )}
            >
              {children}
            </div>
          ) : null}
          {actions ? <div className="mt-3">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}
