type SyncMarketingContactArgs = {
  email: string;
  name?: string | null;
  company?: string | null;
  source: string;
  path?: string | null;
  leadMagnet?: string | null;
};

export type ResendMarketingSyncResult =
  | { status: "skipped"; reason: string }
  | { status: "synced"; audienceId: string; contactId: string | null };

function splitName(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first_name: parts[0] };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
  };
}

export async function syncMarketingLeadToResend(
  args: SyncMarketingContactArgs,
): Promise<ResendMarketingSyncResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId =
    process.env.RESEND_MARKETING_AUDIENCE_ID ??
    process.env.RESEND_AUDIENCE_ID ??
    "";

  if (!apiKey) return { status: "skipped", reason: "RESEND_API_KEY missing" };
  if (!audienceId) {
    return { status: "skipped", reason: "Resend marketing audience missing" };
  }

  const payload = {
    email: args.email,
    unsubscribed: false,
    ...splitName(args.name),
    metadata: {
      company: args.company ?? undefined,
      source: args.source,
      path: args.path ?? undefined,
      lead_magnet: args.leadMagnet ?? undefined,
    },
  };

  const response = await fetch(
    `https://api.resend.com/audiences/${audienceId}/contacts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (response.status === 409) {
    return { status: "synced", audienceId, contactId: null };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend contact sync failed: ${response.status} ${body}`);
  }

  const body = await response.json().catch(() => null);
  const contactId = typeof body?.id === "string" ? body.id : null;
  return { status: "synced", audienceId, contactId };
}
