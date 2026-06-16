"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import { MAX_BBOX_AREA_SQ_DEG, parseWktPoint } from "@/lib/planning-data";
import { WaveformLoader } from "@/components/ui/loading-indicators";

export type Map3DSearchBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type Map3DViewHandle = {
  getSearchBounds: () => Map3DSearchBounds | null;
  /**
   * Fly the camera in until the approximate ground footprint is under
   * MAX_BBOX_AREA_SQ_DEG (i.e. the search-this-area button becomes valid).
   * Keeps the current camera center and tilt so the user doesn't lose
   * orientation.
   */
  zoomToSearchable: () => void;
};

type Props = {
  /** Seed the 3D camera from the 2D map's current center. */
  center: { lat: number; lng: number } | null;
  results: PlanningApplicationEntity[];
  selectedEntityId: number | null;
  onSelectEntity: (id: number | null) => void;
  /** Hint that the API key is missing so we can render a friendly fallback. */
  apiKeyAvailable: boolean;
  onStatusChange?: (status: "loading" | "ready" | "unavailable") => void;
};

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

type Map3DElement = HTMLElement & {
  center: { lat: number; lng: number; altitude: number };
  heading: number;
  tilt: number;
  range: number;
  flyCameraTo?: (opts: {
    endCamera: {
      center: { lat: number; lng: number; altitude: number };
      tilt: number;
      range: number;
      heading?: number;
    };
    durationMillis: number;
  }) => void;
};

/** Rough bbox around the 3D camera look-at from range (meters) and tilt. */
function approximateSearchBounds(el: Map3DElement): Map3DSearchBounds {
  const lat = el.center.lat;
  const lng = el.center.lng;
  const rangeM = Math.max(50, el.range);
  const tiltRad = (Math.min(89, Math.max(1, el.tilt)) * Math.PI) / 180;
  const groundRadiusM =
    rangeM * (0.35 + 0.55 * Math.sin(tiltRad));
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = 111_320 * Math.cos((lat * Math.PI) / 180);
  const dLat = groundRadiusM / metersPerDegreeLat;
  const dLng = groundRadiusM / metersPerDegreeLng;
  return {
    south: lat - dLat,
    north: lat + dLat,
    west: lng - dLng,
    east: lng + dLng,
  };
}

/**
 * Full-viewport photorealistic 3D map. Rendered on top of the 2D map when the
 * user toggles into 3D view. Falls back to a static message when WebGL or the
 * Maps API key is unavailable.
 *
 * Intentionally scoped narrower than the 2D map — clustering and info windows
 * stay in 2D. In 3D the user can click individual 3D pins to pan the camera;
 * the `Entity3DPanel` still surfaces site-level metadata when something is
 * selected.
 */
export const Map3DView = forwardRef<Map3DViewHandle, Props>(function Map3DView(
  {
    center,
    results,
    selectedEntityId,
    onSelectEntity,
    apiKeyAvailable,
    onStatusChange,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<Map3DElement | null>(null);
  const markersRef = useRef<Map<number, HTMLElement>>(new Map());
  // Stash the latest 2D center in a ref so we read it at mount time without
  // re-initializing the 3D element on every 2D idle event.
  const centerRef = useRef(center);
  centerRef.current = center;
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useImperativeHandle(
    ref,
    () => ({
      getSearchBounds: () => {
        const el = mapElRef.current;
        if (!el || status !== "ready") return null;
        return approximateSearchBounds(el);
      },
      zoomToSearchable: () => {
        const el = mapElRef.current;
        if (!el || status !== "ready") return;
        const lat = el.center.lat;
        const tiltRad =
          (Math.min(89, Math.max(1, el.tilt)) * Math.PI) / 180;
        // Solve approximateSearchBounds in reverse: given target area, find
        // the ground radius and the camera range that produces it.
        const targetArea = MAX_BBOX_AREA_SQ_DEG * 0.85;
        const metersPerDegreeLat = 111_320;
        const metersPerDegreeLng =
          111_320 * Math.cos((lat * Math.PI) / 180);
        const groundRadiusM = Math.sqrt(
          (targetArea * metersPerDegreeLat * metersPerDegreeLng) / 4,
        );
        const newRange = Math.max(
          200,
          groundRadiusM / (0.35 + 0.55 * Math.sin(tiltRad)),
        );
        const endCamera = {
          center: {
            lat: el.center.lat,
            lng: el.center.lng,
            altitude: el.center.altitude,
          },
          tilt: el.tilt,
          range: newRange,
          heading: el.heading,
        };
        if (typeof el.flyCameraTo === "function") {
          el.flyCameraTo({ endCamera, durationMillis: 700 });
        } else {
          el.range = endCamera.range;
        }
      },
    }),
    [status],
  );

  useEffect(() => {
    if (!apiKeyAvailable) {
      queueMicrotask(() => setStatus("unavailable"));
      return;
    }
    if (!supportsWebGL()) {
      queueMicrotask(() => setStatus("unavailable"));
      return;
    }
    let cancelled = false;
    const host = hostRef.current;
    const markers = markersRef.current;

    (async () => {
      try {
        const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
        if (key) setOptions({ key, v: "beta" });
        await importLibrary("maps3d");
        if (cancelled || !hostRef.current) return;

        // Guard against double-mount in React strict mode.
        if (mapElRef.current) {
          setStatus("ready");
          return;
        }

        const el = document.createElement("gmp-map-3d") as Map3DElement;
        el.setAttribute("mode", "hybrid");
        el.style.width = "100%";
        el.style.height = "100%";
        el.style.display = "block";

        const seed = centerRef.current ?? { lat: 51.5074, lng: -0.1276 };
        el.center = { lat: seed.lat, lng: seed.lng, altitude: 120 };
        el.heading = 0;
        el.tilt = 60;
        el.range = 800;

        hostRef.current.appendChild(el);
        mapElRef.current = el;

        el.addEventListener(
          "gmp-error",
          () => {
            if (!cancelled) setStatus("unavailable");
          },
          { once: true },
        );

        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      if (mapElRef.current && host?.contains(mapElRef.current)) {
        host.removeChild(mapElRef.current);
      }
      mapElRef.current = null;
      markers.clear();
    };
  }, [apiKeyAvailable]);

  // Sync 3D markers with results.
  useEffect(() => {
    if (status !== "ready") return;
    const el = mapElRef.current;
    if (!el) return;

    let cancelled = false;

    (async () => {
      const maps3d = (await importLibrary("maps3d")) as unknown as {
        Marker3DInteractiveElement?: new (opts: unknown) => HTMLElement;
        Marker3DElement?: new (opts: unknown) => HTMLElement;
      };
      if (cancelled) return;

      const Ctor =
        maps3d.Marker3DInteractiveElement ?? maps3d.Marker3DElement;
      if (!Ctor) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();

      results.forEach((r) => {
        const p = parseWktPoint(r.point);
        if (!p) return;
        const marker = new Ctor({
          position: { lat: p.lat, lng: p.lng, altitude: 60 },
          altitudeMode: "RELATIVE_TO_GROUND",
          extruded: true,
          label: r.reference ?? "",
        });
        marker.addEventListener("gmp-click", () => {
          onSelectEntity(r.entity);
        });
        el.appendChild(marker);
        markersRef.current.set(r.entity, marker);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [results, status, onSelectEntity]);

  // Fly the camera to the selected entity.
  useEffect(() => {
    if (status !== "ready" || !selectedEntityId) return;
    const el = mapElRef.current;
    if (!el) return;
    const row = results.find((r) => r.entity === selectedEntityId);
    if (!row) return;
    const p = parseWktPoint(row.point);
    if (!p) return;

    const endCamera = {
      center: { lat: p.lat, lng: p.lng, altitude: 120 },
      tilt: 65,
      range: 300,
    };

    if (typeof el.flyCameraTo === "function") {
      el.flyCameraTo({ endCamera, durationMillis: 1200 });
    } else {
      el.center = endCamera.center;
      el.tilt = endCamera.tilt;
      el.range = endCamera.range;
    }
  }, [selectedEntityId, results, status]);

  if (status === "unavailable") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 p-8 text-center text-sm text-zinc-300">
        <div className="max-w-sm">
          <p className="mb-2 font-semibold text-white">
            3D view unavailable
          </p>
          <p className="text-zinc-400">
            Your browser or current configuration doesn&apos;t support
            photorealistic 3D tiles. Toggle back to 2D to continue.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-zinc-950">
      <div ref={hostRef} className="absolute inset-0" />
      {status === "loading" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black text-zinc-300">
          <div
            className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-transparent via-white/[0.03] to-transparent"
            aria-hidden
          />
          <WaveformLoader tone="inverse" label="Loading 3D view" />
          <div className="relative flex flex-col items-center gap-1 text-center">
            <span className="text-sm font-medium text-zinc-100">
              Preparing 3D view
            </span>
            <span className="editorial-chapter-label text-zinc-500">
              Photorealistic tiles · Google Maps
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
});

Map3DView.displayName = "Map3DView";
