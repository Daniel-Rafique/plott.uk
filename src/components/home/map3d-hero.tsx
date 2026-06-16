"use client";

import { useCallback, useState } from "react";
import { MapboxHero } from "./mapbox-hero";

/**
 * Landing page hero map.
 * Uses a lightweight Mapbox GL scene for desktop and mobile; Google Maps 3D
 * remains reserved for the authenticated app where focused research needs it.
 */
type HeroMode = "mapbox" | "static";

export function Map3DHero() {
  const [mode, setMode] = useState<HeroMode>("mapbox");
  const showStaticFallback = useCallback(() => setMode("static"), []);

  return (
    <div className="absolute inset-0" aria-hidden>
      {mode === "mapbox" && (
        <MapboxHero onUnavailable={showStaticFallback} />
      )}

      {mode === "static" && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.24),transparent_36%),linear-gradient(135deg,#18181b,#09090b_55%,#020617)]" />
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-black/32 to-black/82" />
    </div>
  );
}
