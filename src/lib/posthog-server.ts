import { PostHog } from "posthog-node";
import { logger } from "@/lib/logger";

let posthogClient: PostHog | null = null;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export function getPostHogClient(): PostHog {
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
      host: POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

export async function captureServerEvent(args: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return;

  const client = new PostHog(token, {
    host: POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });

  try {
    client.capture(args);
    await client.shutdown();
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        event: args.event,
      },
      "posthog_server_capture_failed",
    );
  }
}
