"use client";

import { useEffect, useRef, useState } from "react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const START: [number, number] = [-0.1419, 51.5014];
const END: [number, number] = [-0.1276, 51.5072];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true
  );
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function MapboxHero({ onUnavailable }: { onUnavailable: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!MAPBOX_TOKEN || prefersReducedMotion() || !supportsWebGL()) {
      onUnavailable();
      return;
    }

    let cancelled = false;
    let map: import("mapbox-gl").Map | null = null;
    let resizeRaf = 0;
    let resizeTimer: number | null = null;

    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: START,
        zoom: 13.7,
        pitch: 58,
        bearing: -28,
        interactive: false,
        attributionControl: true,
        logoPosition: "bottom-right",
        fadeDuration: 0,
      });

      map.once("load", () => {
        if (cancelled) return;
        setReady(true);
        resizeRaf = window.requestAnimationFrame(() => {
          map?.resize();
        });
        resizeTimer = window.setTimeout(() => {
          map?.resize();
        }, 250);
        map?.easeTo({
          center: END,
          zoom: 14.45,
          pitch: 64,
          bearing: 24,
          duration: 9500,
          easing: (t) => 1 - Math.pow(1 - t, 3),
          essential: false,
        });
      });

      map.once("error", () => {
        onUnavailable();
      });
    });

    return () => {
      cancelled = true;
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      map?.remove();
    };
  }, [onUnavailable]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      {!ready && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-800 via-zinc-900 to-black" />
      )}
    </div>
  );
}
