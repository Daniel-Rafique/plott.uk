"use client";

/**
 * Full-bleed, in-app Street View overlay.
 *
 * Renders a live `StreetViewPanorama` via the Maps JavaScript API so the user
 * stays inside the app (the previous implementation linked out to
 * maps.google.com with target="_blank", which on mobile launched the Google
 * Maps app and kicked the user out of Plott entirely).
 *
 * Mirrors the 2D/3D switcher UX: animated entrance, editorial chrome with
 * chapter labels, and a graceful fallback to the Static Street View image if
 * no panorama is available for the coordinate.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { importLibrary } from "@googlemaps/js-api-loader";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import { parseWktPoint } from "@/lib/planning-data";
import { WaveformLoader } from "@/components/ui/loading-indicators";

type Props = {
  entity: PlanningApplicationEntity;
  onClose: () => void;
};

type Mode = "loading" | "panorama" | "static" | "unavailable";

const SEARCH_RADIUS_METRES = 80;

export function StreetViewPanel({ entity, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const panoRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [mode, setMode] = useState<Mode>("loading");

  const point = useMemo(() => parseWktPoint(entity.point), [entity.point]);

  useEffect(() => {
    let cancelled = false;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);

    if (!point) {
      queueMicrotask(() => setMode("unavailable"));
      return () => window.removeEventListener("keydown", handleKey);
    }

    (async () => {
      try {
        const { StreetViewPanorama, StreetViewService } =
          (await importLibrary("streetView")) as google.maps.StreetViewLibrary;

        if (cancelled || !hostRef.current) return;

        // Nearest panorama within ~80m so we don't fail at rural coords.
        const svc = new StreetViewService();
        const nearest = await new Promise<google.maps.StreetViewPanoramaData | null>(
          (resolve) => {
            svc.getPanorama(
              {
                location: { lat: point.lat, lng: point.lng },
                radius: SEARCH_RADIUS_METRES,
                source: google.maps.StreetViewSource.OUTDOOR,
                preference: google.maps.StreetViewPreference.NEAREST,
              },
              (data, status) => {
                if (status === google.maps.StreetViewStatus.OK && data) {
                  resolve(data);
                } else {
                  resolve(null);
                }
              },
            );
          },
        );

        if (cancelled) return;

        if (!nearest || !nearest.location) {
          setMode("static");
          return;
        }

        const pano = new StreetViewPanorama(hostRef.current, {
          position: nearest.location.latLng ?? { lat: point.lat, lng: point.lng },
          pano: nearest.location.pano,
          pov: {
            heading: nearest.tiles?.centerHeading ?? 0,
            pitch: 0,
          },
          zoom: 0,
          visible: true,
          addressControl: false,
          linksControl: true,
          panControl: true,
          enableCloseButton: false,
          motionTracking: false,
          motionTrackingControl: false,
          showRoadLabels: false,
          fullscreenControl: false,
        });
        panoRef.current = pano;
        setMode("panorama");
      } catch (err) {
        if (!cancelled) {
          console.warn("StreetViewPanorama failed to load", err);
          setMode("static");
        }
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", handleKey);
      if (panoRef.current) {
        panoRef.current.setVisible(false);
        panoRef.current = null;
      }
    };
  }, [onClose, point]);

  const svKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const staticUrl =
    point && svKey
      ? `https://maps.googleapis.com/maps/api/streetview?size=1280x800&location=${point.lat},${point.lng}&fov=80&pitch=5&key=${svKey}`
      : "";

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-zinc-950/95 text-white backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Street view"
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
            Street view
          </p>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-white">
            {entity.reference ?? "—"}
          </h3>
          {entity["address-text"] ? (
            <p className="mt-0.5 truncate text-xs text-zinc-300">
              {entity["address-text"]}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close street view"
          className="shrink-0 rounded-full p-1.5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden bg-black">
        <div
          ref={hostRef}
          className="absolute inset-0 transition-opacity duration-500"
          style={{ opacity: mode === "panorama" ? 1 : 0 }}
        />

        {mode === "static" && staticUrl ? (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- Google Static Street View URLs are generated at runtime and should not be proxied. */}
            <img
              src={staticUrl}
              alt={`Street view of ${entity.reference ?? "site"}`}
              className="h-full w-full object-cover"
            />
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-200 backdrop-blur-md">
              Static preview · interactive view unavailable at this location
            </p>
          </div>
        ) : null}

        {mode === "unavailable" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
              No coordinate on file
            </p>
            <p className="max-w-sm text-sm text-zinc-200">
              This application doesn&apos;t have a map point, so we can&apos;t
              show Street View. Try opening the LPA case link for site context.
            </p>
          </div>
        ) : null}

        {mode === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black">
            <div
              className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-transparent via-white/[0.03] to-transparent"
              aria-hidden
            />
            <WaveformLoader tone="inverse" label="Loading street view" />
            <div className="relative flex flex-col items-center gap-1 text-center">
              <span className="text-sm font-medium text-zinc-100">
                Preparing street view
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
                Panorama · Google Maps
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
