type SyncMarketingLeadArgs = {
  email: string;
  source: string;
  leadMagnet?: string | null;
};

export type KlaviyoMarketingSyncResult =
  | { status: "skipped"; reason: string }
  | { status: "synced"; listId: string };

const KLAVIYO_SUBSCRIBE_URL =
  "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/";
const DEFAULT_KLAVIYO_API_REVISION = "2026-04-15";

function customSource(args: SyncMarketingLeadArgs) {
  return [args.source, args.leadMagnet].filter(Boolean).join(" | ");
}

export async function syncMarketingLeadToKlaviyo(
  args: SyncMarketingLeadArgs,
): Promise<KlaviyoMarketingSyncResult> {
  const apiKey = process.env.KLAVIYO_API_KEY;
  const listId = process.env.KLAVIYO_LIST_ID;
  const revision =
    process.env.KLAVIYO_API_REVISION ?? DEFAULT_KLAVIYO_API_REVISION;

  if (!apiKey) return { status: "skipped", reason: "KLAVIYO_API_KEY missing" };
  if (!listId) return { status: "skipped", reason: "KLAVIYO_LIST_ID missing" };

  const response = await fetch(KLAVIYO_SUBSCRIBE_URL, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      revision,
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
