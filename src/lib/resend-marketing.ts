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

type MarketingSuccessEmailArgs = {
  email: string;
  leadMagnet?: string | null;
};

type MarketingTemplateConfig = {
  templateId: string;
  variables: Record<string, string>;
};

const FROM =
  process.env.EMAIL_FROM ??
  process.env.RESEND_FROM ??
  "Plott <hello@plott.uk>";
const BUSINESS_ADDRESS =
  process.env.BUSINESS_ADDRESS ?? "10 Buckhold Road London, SW18 4FW";

function appUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  return `${baseUrl}${path}`;
}

function templateForLeadMagnet(leadMagnet?: string | null): MarketingTemplateConfig {
  const normalized = (leadMagnet ?? "").toLowerCase();
  const contactUrl = appUrl("/contact");

  if (normalized.includes("outreach")) {
    return {
      templateId:
        process.env.RESEND_OUTREACH_TEMPLATE_ID ?? "plott-outreach-template",
      variables: {
        RESOURCE_URL: appUrl("/resources/contact-planning-applicants-legally"),
        CONTACT_URL: contactUrl,
        BUSINESS_ADDRESS,
      },
    };
  }

  return {
    templateId:
      process.env.RESEND_LEAD_CHECKLIST_TEMPLATE_ID ?? "plott-lead-checklist",
    variables: {
      RESOURCE_URL: appUrl("/resources/find-uk-planning-application-leads"),
      CONTACT_URL: contactUrl,
      BUSINESS_ADDRESS,
    },
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

export async function sendMarketingLeadSuccessEmail(
  args: MarketingSuccessEmailArgs,
): Promise<{ id: string | null } | { skipped: true; reason: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { skipped: true, reason: "RESEND_API_KEY missing" };

  const template = templateForLeadMagnet(args.leadMagnet);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [args.email],
      template: {
        id: template.templateId,
        variables: template.variables,
      },
      tags: [
        { name: "plott_owner", value: "marketing" },
        { name: "plott_channel", value: "lead_capture_success" },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend success email failed: ${response.status} ${body}`);
  }

  const body = await response.json().catch(() => null);
  return { id: typeof body?.id === "string" ? body.id : null };
}
