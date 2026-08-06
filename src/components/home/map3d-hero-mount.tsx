"use client";

import {
  Component,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { captureError } from "@/lib/observability";

/**
 * Mounts the lazy Mapbox hero with a real failure path.
 *
 * The hero chunk (`map3d-hero` + its `mapbox-gl` import) is the only lazily
 * loaded code on the landing page, so a ChunkLoadError here used to leave the
 * pulsing skeleton up forever. This wrapper imports the chunk imperatively so a
 * load failure is caught rather than left hanging: one retry, then a static
 * poster still frame — the same frame the hero already falls back to when
 * WebGL/Mapbox is unavailable — so a dropped chunk degrades to a rendered
 * background instead of an infinite skeleton. An error boundary catches the
 * rarer case of the hero throwing once mounted and lands on the same poster.
 */

const MAX_RETRIES = 1;

function HeroSkeleton() {
  return (
    <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
  );
}

/**
 * Static still frame, identical to `Map3DHero`'s own `mode === "static"`
 * fallback, so a failed chunk looks the same as an unsupported browser.
 */
function HeroPoster() {
  return (
    <div className="absolute inset-0" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.24),transparent_36%),linear-gradient(135deg,#18181b,#09090b_55%,#020617)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-black/32 to-black/82" />
    </div>
  );
}

class HeroErrorBoundary extends Component<
  { fallback: ReactNode; onError: (error: unknown) => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function Map3DHeroMount() {
  const [Hero, setHero] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const load = () => {
      import("./map3d-hero")
        .then((mod) => {
          if (!cancelled) setHero(() => mod.Map3DHero);
        })
        .catch((error) => {
          if (cancelled) return;
          captureError(error, {
            extra: { component: "Map3DHero", phase: "load", attempt: attempts },
          });
          if (attempts < MAX_RETRIES) {
            attempts += 1;
            load();
            return;
          }
          setFailed(true);
        });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <HeroPoster />;
  if (!Hero) return <HeroSkeleton />;

  return (
    <HeroErrorBoundary
      fallback={<HeroPoster />}
      onError={(error) =>
        captureError(error, {
          extra: { component: "Map3DHero", phase: "render" },
        })
      }
    >
      <Hero />
    </HeroErrorBoundary>
  );
}
