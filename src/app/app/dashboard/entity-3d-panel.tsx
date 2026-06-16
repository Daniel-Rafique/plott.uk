"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import { parseWktPoint } from "@/lib/planning-data";

type Props = {
  entity: PlanningApplicationEntity;
  onClose: () => void;
  /** Optional callback to apply a tag-based filter (e.g. applicant/agent name). */
  onTagFilter?: (name: string) => void;
};

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Renders a Photorealistic 3D tile view of a selected planning application.
 * Uses the gmp-map-3d custom element; falls back to Street View Static when
 * 3D cannot load (no WebGL, gmp-error, library failure).
 */
export function Entity3DPanel({ entity, onClose, onTagFilter }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<"loading" | "map3d" | "streetview">(
    "loading",
  );

  const point = useMemo(() => parseWktPoint(entity.point), [entity.point]);

  useEffect(() => {
    let cancelled = false;
    if (!point) {
      queueMicrotask(() => setMode("streetview"));
      return;
    }
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !supportsWebGL()) {
      queueMicrotask(() => setMode("streetview"));
      return;
    }

    (async () => {
      try {
        setOptions({ key, v: "beta" });
        await importLibrary("maps3d");
        if (cancelled || !hostRef.current) return;

        hostRef.current.innerHTML = "";

        const el = document.createElement("gmp-map-3d") as HTMLElement & {
          center: { lat: number; lng: number; altitude: number };
          heading: number;
          tilt: number;
          range: number;
          flyCameraAround?: (opts: {
            camera: unknown;
            durationMillis: number;
            rounds: number;
          }) => void;
        };
        el.setAttribute("mode", "hybrid");
        el.style.width = "100%";
        el.style.height = "100%";
        hostRef.current.appendChild(el);
        el.center = { lat: point.lat, lng: point.lng, altitude: 120 };
        el.heading = 0;
        el.tilt = 65;
        el.range = 300;

        // gmp-error => fallback
        el.addEventListener(
          "gmp-error",
          () => {
            if (!cancelled) setMode("streetview");
          },
          { once: true },
        );

        const maps3d = (await importLibrary("maps3d")) as unknown as {
          Marker3DElement?: new (opts: unknown) => HTMLElement;
        };
        if (typeof maps3d.Marker3DElement === "function") {
          const pin = new maps3d.Marker3DElement({
            position: { lat: point.lat, lng: point.lng, altitude: 100 },
            altitudeMode: "RELATIVE_TO_GROUND",
            extruded: true,
            label: entity.reference ?? "",
          });
          el.appendChild(pin);
        }

        setMode("map3d");

        if (typeof el.flyCameraAround === "function") {
          el.flyCameraAround({
            camera: {
              center: { lat: point.lat, lng: point.lng, altitude: 120 },
              tilt: 65,
              range: 300,
            },
            durationMillis: 20_000,
            rounds: 1,
          });
        }
      } catch {
        if (!cancelled) setMode("streetview");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entity.entity, entity.reference, point]);

  const svKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_STATIC_API_KEY ??
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const streetViewUrl =
    point && svKey
      ? `https://maps.googleapis.com/maps/api/streetview?size=640x480&location=${point.lat},${point.lng}&fov=80&pitch=10&key=${svKey}`
      : "";

  const applicant = entity.enrichment?.applicantName?.trim() || null;
  const agent = entity.enrichment?.agentName?.trim() || null;

  return (
    <aside className="pointer-events-auto absolute right-4 top-4 bottom-4 z-20 flex w-[420px] max-w-[calc(100vw-120px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 text-white shadow-2xl backdrop-blur-xl">
      <header className="flex items-start justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
            3D site view
          </p>
          <h3 className="mt-0.5 truncate text-sm font-semibold text-white">
            {entity.reference ?? "—"}
          </h3>
          <p className="mt-0.5 truncate text-xs text-zinc-300">
            {entity["address-text"] ?? ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close 3D panel"
          className="rounded-full p-1.5 text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="relative flex-1 overflow-hidden bg-black">
        {mode !== "streetview" && (
          <div ref={hostRef} className="absolute inset-0" />
        )}
        {mode === "streetview" &&
          (streetViewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Google Static Street View URLs are generated at runtime and should not be proxied.
            <img
              src={streetViewUrl}
              alt={`Street View of ${entity.reference ?? "site"}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-zinc-400">
              3D view unavailable. Configure{" "}
              <code className="mx-1 rounded bg-white/10 px-1">
                NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
              </code>
              to enable.
            </div>
          ))}
        {mode === "loading" && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-800 to-black" />
        )}
      </div>

      {applicant || agent ? (
        <div className="border-t border-white/10 px-4 py-3 text-xs text-zinc-200">
          <div className="flex flex-wrap gap-2">
            {applicant ? (
              <button
                type="button"
                onClick={() => onTagFilter?.(applicant)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200 transition-colors hover:bg-emerald-500/15"
                title={`Filter by "${applicant}"`}
              >
                <span className="text-emerald-200/70">Applicant:</span>
                <span className="truncate">{applicant}</span>
              </button>
            ) : null}
            {agent ? (
              <button
                type="button"
                onClick={() => onTagFilter?.(agent)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200 transition-colors hover:bg-cyan-500/15"
                title={`Filter by "${agent}"`}
              >
                <span className="text-cyan-200/70">Agent:</span>
                <span className="truncate">{agent}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
