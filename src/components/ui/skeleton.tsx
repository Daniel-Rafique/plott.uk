/**
 * Editorial-style skeletons. Deliberately sharp (rounded-sm, not rounded-md)
 * and muted so they read as deliberate placeholder shapes rather than
 * rounded-rectangle blobs. Pair with a shimmer animation via Tailwind's
 * `animate-pulse` plus the existing `.animate-shimmer` overlay when needed.
 */

import { cn } from "@/lib/utils";

/** Base primitive. Compose these for any placeholder shape. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-sm bg-zinc-100", className)}
      aria-hidden
      {...props}
    />
  );
}

/** Multi-line paragraph placeholder. The last line is deliberately shorter
 * to mimic natural copy length. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: i === lines - 1 ? "72%" : "100%" }}
        />
      ))}
    </div>
  );
}

/**
 * Editorial card placeholder — a top hairline, chapter label, heading,
 * and body copy. Matches the structure of a typical result row / modal
 * section so swaps feel seamless.
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 p-4", className)}>
      <div className="editorial-hairline pt-3">
        <Skeleton className="h-2 w-16" />
      </div>
      <Skeleton className="h-5 w-3/5" />
      <SkeletonText lines={2} />
    </div>
  );
}

/**
 * Row-based placeholder for lists / tables. Each row has a small leading
 * accent column plus a title and subtitle.
 */
export function SkeletonTable({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-zinc-100", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2 w-4/5" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/**
 * Full-bleed editorial skeleton for modal bodies. Uses a chapter label
 * placeholder at the top to mirror the real header hierarchy.
 */
export function SkeletonModalBody({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-5", className)}>
      <div className="space-y-2">
        <Skeleton className="h-2 w-24" />
        <Skeleton className="h-7 w-2/3" />
      </div>
      <div className="editorial-hairline pt-4">
        <SkeletonText lines={3} />
      </div>
      <div className="editorial-hairline pt-4 space-y-3">
        <Skeleton className="h-2 w-20" />
        <SkeletonText lines={2} />
      </div>
    </div>
  );
}
