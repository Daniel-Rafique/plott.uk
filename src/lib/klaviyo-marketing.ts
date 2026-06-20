type SyncMarketingLeadArgs = {
  email: string;
  source: string;
  leadMagnet?: string | null;
};

type KlaviyoProfileProperties = Record<string, string | number | boolean | null>;

type KlaviyoProfileArgs = {
  email: string;
  name?: string | null;
  company?: string | null;
  properties?: KlaviyoProfileProperties;
};

type KlaviyoEventArgs = {
  email: string;
  event: string;
  properties?: Record<string, unknown>;
  uniqueId?: string;
  time?: Date;
};

export type KlaviyoMarketingResult =
  | { status: "skipped"; reason: string }
  | { status: "sent" };

export type KlaviyoMarketingSyncResult =
  | { status: "skipped"; reason: string }
  | { status: "synced"; listId: string };

const KLAVIYO_SUBSCRIBE_URL =
  "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/";
const KLAVIYO_PROFILE_IMPORT_URL = "https://a.klaviyo.com/api/profile-import/";
const KLAVIYO_EVENTS_URL = "https://a.klaviyo.com/api/events/";
const DEFAULT_KLAVIYO_API_REVISION = "2026-04-15";

function customSource(args: SyncMarketingLeadArgs) {
  return [args.source, args.leadMagnet].filter(Boolean).join(" | ");
}

function klaviyoConfig(): { apiKey: string; revision: string } | { reason: string } {
  const apiKey = process.env.KLAVIYO_API_KEY;
  if (!apiKey) return { reason: "KLAVIYO_API_KEY missing" };
  return {
    apiKey,
    revision: process.env.KLAVIYO_API_REVISION ?? DEFAULT_KLAVIYO_API_REVISION,
  };
}

function splitName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first_name: parts[0] };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
}

function jsonHeaders(config: { apiKey: string; revision: string }) {
  return {
    Authorization: `Klaviyo-API-Key ${config.apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    revision: config.revision,
  };
}

export async function upsertKlaviyoProfile(
  args: KlaviyoProfileArgs,
): Promise<KlaviyoMarketingResult> {
  const config = klaviyoConfig();
  if ("reason" in config) return { status: "skipped", reason: config.reason };

  const response = await fetch(KLAVIYO_PROFILE_IMPORT_URL, {
    method: "POST",
    headers: jsonHeaders(config),
    body: JSON.stringify({
      data: {
        type: "profile",
        attributes: {
          email: args.email,
          ...splitName(args.name),
          organization: args.company ?? undefined,
          properties: args.properties,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Klaviyo profile upsert failed: ${response.status} ${body}`);
  }

  return { status: "sent" };
}

export async function trackKlaviyoEvent(
  args: KlaviyoEventArgs,
): Promise<KlaviyoMarketingResult> {
  const config = klaviyoConfig();
  if ("reason" in config) return { status: "skipped", reason: config.reason };

  const response = await fetch(KLAVIYO_EVENTS_URL, {
    method: "POST",
    headers: jsonHeaders(config),
    body: JSON.stringify({
      data: {
        type: "event",
        attributes: {
          properties: args.properties ?? {},
          metric: {
            data: {
              type: "metric",
              attributes: {
                name: args.event,
              },
            },
          },
          profile: {
            data: {
              type: "profile",
              attributes: {
                email: args.email,
              },
            },
          },
          unique_id: args.uniqueId,
          time: args.time?.toISOString(),
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Klaviyo event failed: ${response.status} ${body}`);
  }

  return { status: "sent" };
}

export async function syncMarketingLeadToKlaviyo(
  args: SyncMarketingLeadArgs,
): Promise<KlaviyoMarketingSyncResult> {
  const listId = process.env.KLAVIYO_LIST_ID;
  const config = klaviyoConfig();

  if ("reason" in config) return { status: "skipped", reason: config.reason };
  if (!listId) return { status: "skipped", reason: "KLAVIYO_LIST_ID missing" };

  const response = await fetch(KLAVIYO_SUBSCRIBE_URL, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${config.apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      revision: config.revision,
    },
    body: JSON.stringify({
      data: {
        type: "profile-subscription-bulk-create-job",
        attributes: {
          custom_source: customSource(args),
          profiles: {
            data: [
              {
                type: "profile",
                attributes: {
                  email: args.email,
                  subscriptions: {
                    email: {
                      marketing: {
                        consent: "SUBSCRIBED",
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        relationships: {
          list: {
            data: {
              type: "list",
              id: listId,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Klaviyo contact sync failed: ${response.status} ${body}`);
  }

  return { status: "synced", listId };
}
