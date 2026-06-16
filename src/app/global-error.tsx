"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/observability";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    captureError(error, { extra: { digest: error.digest ?? null } });
  }, [error]);

  return (
    <html lang="en-GB">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            The app hit an unexpected error
          </h1>
          <p style={{ color: "#52525b", marginTop: 8, fontSize: 14 }}>
            Please refresh the page. If this keeps happening, contact support.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 11,
                color: "#a1a1aa",
                marginTop: 12,
              }}
            >
              Ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
