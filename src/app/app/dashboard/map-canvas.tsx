"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import posthog from "posthog-js";
import type { Map3DViewHandle } from "./map-3d-view";
import type { PlanningApplicationEntity } from "@/lib/planning-data";
import {
  MAX_BBOX_AREA_SQ_DEG,
  bboxAreaKm2,
  isBboxSearchable,
  parseWktPoint,
} from "@/lib/planning-data";
import {
  Search,
  Map as MapIcon,
  Box,
  Square,
  ZoomIn,
} from "lucide-react";
import { WaveformLoader } from "@/components/ui/loading-indicators";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { Entity3DPanel } from "./entity-3d-panel";
import { Map3DView } from "./map-3d-view";
import { StreetViewPanel } from "./street-view-panel";

let isGoogleMapsInitialized = false;

export type Bounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type MapCanvasProps = {
  results: PlanningApplicationEntity[];
  onSearchArea: (bounds: Bounds) => void;
  searching: boolean;
  selectedEntityId: number | null;
  onSelectEntity: (id: number | null) => void;
  /** Optional callback to apply a tag-based filter (e.g. applicant/agent name). */
  onTagFilter?: (name: string) => void;
};

type ViewMode = "2d" | "3d";

/**
 * Imperative API exposed to parent components so they can drive the map from
 * server-side signals (e.g. a geocoded viewport from the deep-search stream).
 */
export type MapCanvasHandle = {
  panAndZoomTo: (bounds: Bounds) => void;
  getCurrentBounds: () => Bounds | null;
};

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    results,
    onSearchArea,
    searching,
    selectedEntityId,
    onSelectEntity,
    onTagFilter,
  },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const markersRef = useRef<
    Map<number, google.maps.marker.AdvancedMarkerElement>
  >(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  // Cache the latest 2D map center so when the user flips to 3D we can seed
  // the photorealistic camera at the same spot they were looking at.
  const [mapCenter, setMapCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const map3dRef = useRef<Map3DViewHandle | null>(null);
  const [map3dStatus, setMap3dStatus] = useState<
    "loading" | "ready" | "unavailable" | null
  >(null);
  // Live bbox of the visible viewport. Drives the "Search this area" button
  // state so we can swap it into a zoom affordance when the area is too wide
  // for a fast Planning Data query (see MAX_BBOX_AREA_SQ_DEG).
  const [currentBounds, setCurrentBounds] = useState<Bounds | null>(null);
  // Street View is rendered as an in-app overlay (not an external link) so
  // the user never leaves Plott when inspecting a site from the ground.
  const [streetViewEntity, setStreetViewEntity] =
    useState<PlanningApplicationEntity | null>(null);

  useEffect(() => {
    if (viewMode === "2d") setMap3dStatus(null);
  }, [viewMode]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || apiKey === "YOUR_GOOGLE_MAPS_API_KEY_HERE") {
      setApiKeyMissing(true);
      return;
    }

    if (!isGoogleMapsInitialized) {
      setOptions({ key: apiKey, v: "weekly" });
      isGoogleMapsInitialized = true;
    }

    const initMap = async () => {
      try {
        const { Map, InfoWindow } = (await importLibrary(
          "maps",
        )) as google.maps.MapsLibrary;

        if (!containerRef.current) return;

        const map = new Map(containerRef.current, {
          center: { lat: 51.5074, lng: -0.1276 },
          zoom: 14,
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
          mapTypeId: google.maps.MapTypeId.HYBRID,
          streetViewControl: true,
          fullscreenControl: true,
          mapTypeControl: true,
          tilt: 45,
          mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.DEFAULT,
            position: google.maps.ControlPosition.TOP_RIGHT,
            mapTypeIds: [
              google.maps.MapTypeId.ROADMAP,
              google.maps.MapTypeId.TERRAIN,
              google.maps.MapTypeId.SATELLITE,
              google.maps.MapTypeId.HYBRID,
            ],
          },
        });

        mapRef.current = map;
        infoWindowRef.current = new InfoWindow();
        clustererRef.current = new MarkerClusterer({ map });

        const syncViewport = () => {
          const c = map.getCenter();
          if (c) setMapCenter({ lat: c.lat(), lng: c.lng() });
          const b = map.getBounds();
          if (b) {
            const ne = b.getNorthEast();
            const sw = b.getSouthWest();
            setCurrentBounds({
              west: sw.lng(),
              south: sw.lat(),
              east: ne.lng(),
              north: ne.lat(),
            });
          }
        };
        syncViewport();
        map.addListener("idle", syncViewport);

        setMapLoaded(true);
      } catch (err) {
        console.error("Error loading Google Maps:", err);
      }
    };

    void initMap();
    const markers = markersRef.current;

    return () => {
      markers.forEach((m) => (m.map = null));
      markers.clear();
      clustererRef.current?.clearMarkers();
      mapRef.current = null;
    };
  }, []);

  const updateMarkers = useCallback(async () => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;
    if (!map || !clusterer) return;

    clusterer.clearMarkers();
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current.clear();

    const { AdvancedMarkerElement } = (await importLibrary(
      "marker",
    )) as google.maps.MarkerLibrary;
    const newMarkers: google.maps.marker.AdvancedMarkerElement[] = [];

    results.forEach((r) => {
      const p = parseWktPoint(r.point);
      if (!p) return;

      const marker = new AdvancedMarkerElement({
        map,
        position: { lat: p.lat, lng: p.lng },
        title: r.reference || "",
      });

      marker.addListener("gmp-click", () => {
        onSelectEntity(r.entity);
        showInfoWindow(r, marker);
      });

      markersRef.current.set(r.entity, marker);
      newMarkers.push(marker);
    });

    clusterer.addMarkers(newMarkers);
  }, [results, onSelectEntity]);

  const showInfoWindow = (
    r: PlanningApplicationEntity,
    marker: google.maps.marker.AdvancedMarkerElement,
  ) => {
    const infoWindow = infoWindowRef.current;
    const map = mapRef.current;
    if (!infoWindow || !map) return;

    const p = parseWktPoint(r.point);
    const hasStreetView = !!p;

    const wrap = document.createElement("div");
    wrap.style.cssText =
      "padding:10px; max-width:260px; font-family:system-ui,-apple-system,sans-serif;";

    const title = document.createElement("div");
    title.style.cssText =
      "font-weight:600; font-size:14px; color:#18181b; margin-bottom:4px;";
    title.textContent = r.reference || "—";
    wrap.appendChild(title);

    const statusText =
      r["planning-decision-type"] || r["planning-application-status"] || "";
    if (statusText) {
      const status = document.createElement("div");
      status.style.cssText =
        "font-size:11px; font-weight:500; color:#2563eb; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;";
      status.textContent = statusText;
      wrap.appendChild(status);
    }

    if (r["address-text"]) {
      const addr = document.createElement("div");
      addr.style.cssText =
        "font-size:12px; color:#52525b; margin-bottom:10px; line-height:1.4;";
      addr.textContent = r["address-text"];
      wrap.appendChild(addr);
    }

    if (r.enrichment?.applicantName || r.enrichment?.agentName) {
      const enr = document.createElement("div");
      enr.style.cssText =
        "font-size:12px; color:#047857; margin-bottom:10px; line-height:1.4;";
      const parts: string[] = [];
      if (r.enrichment.applicantName)
        parts.push(`Applicant: ${r.enrichment.applicantName}`);
      if (r.enrichment.agentName)
        parts.push(`Agent: ${r.enrichment.agentName}`);
      enr.textContent = parts.join(" · ");
      wrap.appendChild(enr);
    }

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex; gap:6px; flex-wrap:wrap;";
    if (hasStreetView) {
      const sv = document.createElement("button");
      sv.type = "button";
      sv.style.cssText =
        "display:inline-flex; align-items:center; gap:4px; background:#18181b; color:white; padding:6px 10px; border:0; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; font-family:inherit;";
      sv.textContent = "Street View";
      sv.addEventListener("click", (e) => {
        e.preventDefault();
        infoWindow.close();
        setStreetViewEntity(r);
      });
      btnRow.appendChild(sv);
    }
    wrap.appendChild(btnRow);

    infoWindow.setContent(wrap);
    infoWindow.open(map, marker);
  };

  useEffect(() => {
    if (mapLoaded) {
      void updateMarkers();
    }
  }, [mapLoaded, updateMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedEntityId || !mapLoaded) return;

    const row = results.find((r) => r.entity === selectedEntityId);
    if (!row) return;

    const p = parseWktPoint(row.point);
    if (!p) return;

    map.panTo({ lat: p.lat, lng: p.lng });
    const zoom = map.getZoom();
    if (zoom !== undefined && zoom < 16) {
      map.setZoom(16);
    }

    const marker = markersRef.current.get(selectedEntityId);
    if (marker) {
      showInfoWindow(row, marker);
    }
  }, [selectedEntityId, results, mapLoaded]);

  // In 3D the camera has no idle/bounds_changed event we can cheaply listen
  // to, so we poll the approximate ground bounds on a short interval while
  // the 3D view is active. 500ms is imperceptible but keeps button state
  // responsive as the user drags/flies the camera.
  useEffect(() => {
    if (viewMode !== "3d" || map3dStatus !== "ready") return;
    const tick = () => {
      const b = map3dRef.current?.getSearchBounds();
      if (b) setCurrentBounds(b);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [viewMode, map3dStatus]);

  const tooLarge = useMemo(() => {
    if (!currentBounds) return false;
    return !isBboxSearchable(
      currentBounds.west,
      currentBounds.south,
      currentBounds.east,
      currentBounds.north,
    );
  }, [currentBounds]);

  const areaKm2 = useMemo(() => {
    if (!currentBounds) return null;
    return bboxAreaKm2(
      currentBounds.west,
      currentBounds.south,
      currentBounds.east,
      currentBounds.north,
    );
  }, [currentBounds]);

  /** Square bbox at 85% of the server max, centred on the given point. */
  function searchableBoundsAround(lat: number, lng: number): Bounds {
    const half = Math.sqrt(MAX_BBOX_AREA_SQ_DEG * 0.85) / 2;
    return {
      west: lng - half,
      south: lat - half,
      east: lng + half,
      north: lat + half,
    };
  }

  /**
   * When the viewport is too wide for PlanWire nearby, zoom to the max
   * searchable square around the current centre and search that box in one
   * click (previously the button only zoomed, requiring a second press).
   */
  function zoomToSearchableAndSearch() {
    posthog.capture("map_auto_zoom_triggered", {
      view_mode: viewMode,
      area_km2: areaKm2 ?? undefined,
      auto_search: true,
    });

    if (viewMode === "3d") {
      const existing = map3dRef.current?.getSearchBounds();
      const lat =
        existing != null
          ? (existing.south + existing.north) / 2
          : (mapCenter?.lat ?? 51.5074);
      const lng =
        existing != null
          ? (existing.west + existing.east) / 2
          : (mapCenter?.lng ?? -0.1276);
      const target = searchableBoundsAround(lat, lng);
      map3dRef.current?.zoomToSearchable();
      onSearchArea(target);
      return;
    }

    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (!c) return;
    const target = searchableBoundsAround(c.lat(), c.lng());
    map.fitBounds(
      new google.maps.LatLngBounds(
        { lat: target.south, lng: target.west },
        { lat: target.north, lng: target.east },
      ),
      24,
    );
    // Search the known-good target immediately — don't wait for idle; the
    // map animation can finish while the request is in flight.
    onSearchArea(target);
  }

  const panAndZoomTo = useCallback((bounds: Bounds) => {
    // Route to the 2D map by default — geocoded viewports are ground-plane
    // bboxes that flat-fit naturally. If the user happens to be in 3D we
    // update the 2D map too so flipping back preserves the new location.
    const map = mapRef.current;
    if (map) {
      const target = new google.maps.LatLngBounds(
        { lat: bounds.south, lng: bounds.west },
        { lat: bounds.north, lng: bounds.east },
      );
      map.fitBounds(target, 32);
    }

    if (viewMode === "3d" && map3dRef.current) {
      const el = map3dRef.current as unknown as {
        flyCameraTo?: (opts: {
          endCamera: {
            center: { lat: number; lng: number; altitude: number };
            tilt: number;
            range: number;
          };
          durationMillis: number;
        }) => void;
      };
      const centerLat = (bounds.south + bounds.north) / 2;
      const centerLng = (bounds.west + bounds.east) / 2;
      const metersPerDegreeLat = 111_320;
      const metersPerDegreeLng =
        111_320 * Math.cos((centerLat * Math.PI) / 180);
      const spanLatM = (bounds.north - bounds.south) * metersPerDegreeLat;
      const spanLngM = (bounds.east - bounds.west) * metersPerDegreeLng;
      const range = Math.max(400, Math.min(20_000, (spanLatM + spanLngM) * 0.75));
      if (typeof el.flyCameraTo === "function") {
        el.flyCameraTo({
          endCamera: {
            center: { lat: centerLat, lng: centerLng, altitude: 120 },
            tilt: 60,
            range,
          },
          durationMillis: 1200,
        });
      }
    }
  }, [viewMode]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      panAndZoomTo,
      getCurrentBounds: () => currentBounds,
    }),
    [panAndZoomTo, currentBounds],
  );

  function runSearchFromMap() {
    if (tooLarge) {
      zoomToSearchableAndSearch();
      return;
    }

    if (viewMode === "3d") {
      const b = map3dRef.current?.getSearchBounds();
      if (!b) return;
      onSearchArea(b);
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    onSearchArea({
      west: sw.lng(),
      south: sw.lat(),
      east: ne.lng(),
      north: ne.lat(),
    });
  }

  if (apiKeyMissing) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-100 p-8 text-center">
        <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <MapIcon className="mx-auto mb-4 h-12 w-12 text-zinc-400" />
          <h3 className="mb-2 text-lg font-semibold text-zinc-900">
            Google Maps Configuration Required
          </h3>
          <p className="text-sm text-zinc-500 mb-4">
            Please add your Google Maps credentials to the{" "}
            <code className="rounded bg-zinc-100 px-1">.env</code> file:
          </p>
          <div className="space-y-2 text-left">
            <div className="rounded-md bg-zinc-50 p-2 text-xs font-mono break-all border border-zinc-200">
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </div>
            <div className="rounded-md bg-zinc-50 p-2 text-xs font-mono break-all border border-zinc-200">
              NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
            </div>
          </div>
          <p className="mt-4 text-xs text-zinc-400">
            A Map ID is required to use modern Advanced Markers and 3D features.
          </p>
        </div>
      </div>
    );
  }

  const selectedEntity = results.find((r) => r.entity === selectedEntityId);

  return (
    <div className="relative h-full w-full min-h-0 flex-1 overflow-hidden bg-zinc-200">
      {/*
        Keep the 2D map mounted at all times so state (zoom, drag history,
        clusterer) survives a round-trip through 3D. Hide with CSS rather
        than unmounting.
      */}
      <div
        ref={containerRef}
        className="absolute inset-0 block overflow-hidden"
        style={{ visibility: viewMode === "2d" ? "visible" : "hidden" }}
      />

      {viewMode === "3d" ? (
        <div className="absolute inset-0">
          <Map3DView
            ref={map3dRef}
            center={mapCenter}
            results={results}
            selectedEntityId={selectedEntityId}
            onSelectEntity={onSelectEntity}
            apiKeyAvailable={!apiKeyMissing}
            onStatusChange={setMap3dStatus}
          />
        </div>
      ) : null}

      {/* 2D / 3D toggle */}
      <div className="pointer-events-none absolute left-4 top-4 flex gap-2">
        <div className="pointer-events-auto inline-flex rounded-full border border-zinc-200 bg-white p-1 shadow-lg">
          <button
            type="button"
            aria-label="2D map"
            onClick={() => setViewMode("2d")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "2d"
                ? "bg-zinc-900 text-white"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <Square className="h-3.5 w-3.5" aria-hidden />
            2D
          </button>
          <button
            type="button"
            aria-label="3D map"
            onClick={() => setViewMode("3d")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "3d"
                ? "bg-zinc-900 text-white"
                : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            <Box className="h-3.5 w-3.5" aria-hidden />
            3D
          </button>
        </div>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-0 z-10 flex flex-col items-center gap-1.5 px-4 ${
          viewMode === "3d"
            ? "bottom-28 sm:bottom-32"
            : "bottom-6"
        }`}
      >
        <button
          type="button"
          onClick={runSearchFromMap}
          disabled={
            searching ||
            !mapLoaded ||
            (viewMode === "3d" && map3dStatus !== "ready")
          }
          aria-label={
            searching
              ? "Searching this area"
              : tooLarge
                ? "Zoom in to a searchable area and search"
                : "Search the visible area"
          }
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-lg transition hover:bg-zinc-50 disabled:opacity-70"
        >
          {searching ? (
            <WaveformLoader tone="neutral" />
          ) : tooLarge ? (
            <>
              <ZoomIn className="h-4 w-4 text-zinc-700" />
              Zoom in &amp; search
            </>
          ) : (
            <>
              <Search className="h-4 w-4 text-zinc-700" />
              Search this area
            </>
          )}
        </button>
        {tooLarge && !searching && areaKm2 != null ? (
          <p className="pointer-events-auto rounded-md bg-white/90 px-2 py-0.5 text-[11px] text-zinc-600 shadow-sm backdrop-blur-sm">
            Showing ~{areaKm2 >= 10 ? Math.round(areaKm2) : areaKm2.toFixed(1)} km² —
            click to zoom to a searchable area and search
          </p>
        ) : null}
      </div>

      {/*
        Site-focus side panel. Shown in 3D mode whenever a marker is selected
        — gives a close-up fly-around of that specific application alongside
        the full-viewport 3D map.
      */}
      {viewMode === "3d" && selectedEntity ? (
        <Entity3DPanel
          entity={selectedEntity}
          onClose={() => onSelectEntity(null)}
          onTagFilter={onTagFilter}
        />
      ) : null}

      {streetViewEntity ? (
        <StreetViewPanel
          entity={streetViewEntity}
          onClose={() => setStreetViewEntity(null)}
        />
      ) : null}
    </div>
  );
});

MapCanvas.displayName = "MapCanvas";
