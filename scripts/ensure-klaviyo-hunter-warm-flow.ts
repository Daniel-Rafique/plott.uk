/**
 * Ensures a Klaviyo list + list-triggered nurture flow for Hunter warm
 * construction imports.
 *
 * Creates:
 *   - List: "Hunter Construction Warm"
 *   - Draft flow (or syncs live "Nuture" / "Hunter construction warm nurture")
 *     trigger: Added to List
 *     exit: already has Subscription Started or Trial Started (all-time)
 *     emails: immediate → delays → drag-and-drop templates with 10OFF
 *
 * Required env:
 *   KLAVIYO_API_KEY
 *
 * Usage:
 *   npm run klaviyo:ensure-hunter-warm-flow
 *   npm run klaviyo:ensure-hunter-warm-flow -- --force-templates
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const API_BASE = "https://a.klaviyo.com/api";
const DEFAULT_REVISION = "2026-04-15";
const LIST_NAME = "Hunter Construction Warm";
/** Live flow was renamed in the UI; accept both names when syncing. */
const FLOW_NAMES = ["Nuture", "Hunter construction warm nurture"] as const;
const FLOW_NAME = FLOW_NAMES[0];
const SIGNUP_URL = "https://plott.uk/auth/sign-up";
const RESOURCE_URL = "https://plott.uk/resources";
const PROMO_CODE = "10OFF";
const PRICING_URL = "https://plott.uk/pricing";

const TEMPLATE_SPECS = [
  {
    key: "email1",
    name: "Plott · Nurture · Email 1 (intro) · drag & drop",
    subject: "Planning leads for UK builders — without the portal grind",
    preview: "See nearby applications before your competitors do.",
    heading: "Find planning leads before they go cold",
    body: "Plott maps UK planning applications so loft, extension, roofing and general builders can spot work nearby, filter by trade, and reach out with letters that stay behind your review step.",
    cta: "See how Plott works",
    href: `${PRICING_URL}?utm_source=klaviyo&utm_medium=email&utm_campaign=nurture_email1`,
  },
  {
    key: "email2",
    name: "Plott · Nurture · Email 2 (how it works) · drag & drop",
    subject: "Draw a radius. Pin applications. Send the letter.",
    preview: "Built for contractors who win work from planning activity.",
    heading: "From map to outreach in minutes",
    body: "Draw a search area, pin the applications that match your trade, and generate outreach that uses your company details. Starter filters and letter defaults get you moving faster — you stay in control before anything goes out.",
    cta: "Create your workspace",
    href: `${SIGNUP_URL}?utm_source=klaviyo&utm_medium=email&utm_campaign=nurture_email2`,
  },
  {
    key: "email3",
    name: "Plott · Nurture · Email 3 (CTA) · drag & drop",
    subject: "Ready when you are — start with Plott",
    preview: "Cancel anytime. No free-trial promise — billed when you choose a plan.",
    heading: "Start finding leads this week",
    body: "If you're chasing loft conversions, extensions or roofing work from planning activity, Plott is built for that workflow. Create an account free, then pick a plan when you're ready — billed at checkout, cancel anytime.",
    cta: "Get started",
    href: `${PRICING_URL}?utm_source=klaviyo&utm_medium=email&utm_campaign=nurture_email3`,
  },
] as const;

type Json = Record<string, unknown>;

function parseArgs(argv: string[]) {
  return { forceTemplates: argv.includes("--force-templates") };
}

function config() {
  const apiKey = process.env.KLAVIYO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("KLAVIYO_API_KEY is not set (.env or .env.local).");
  }
  return {
    apiKey,
    revision: process.env.KLAVIYO_API_REVISION?.trim() || DEFAULT_REVISION,
    fromEmail: process.env.KLAVIYO_FROM_EMAIL?.trim() || "hi@plott.uk",
    fromLabel: process.env.KLAVIYO_FROM_LABEL?.trim() || "Plott",
  };
}

function headers(cfg: ReturnType<typeof config>, json = true) {
  return {
    Authorization: `Klaviyo-API-Key ${cfg.apiKey}`,
    Accept: "application/vnd.api+json",
    ...(json ? { "Content-Type": "application/vnd.api+json" } : {}),
    revision: cfg.revision,
  };
}

async function klaviyoFetch(
  cfg: ReturnType<typeof config>,
  path: string,
  init?: RequestInit,
): Promise<Json> {
  const res = await fetch(`${API_BASE}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      ...headers(cfg, Boolean(init?.body)),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} → ${res.status} ${text.slice(0, 1200)}`,
    );
  }
  return text ? (JSON.parse(text) as Json) : {};
}

async function listAll(
  cfg: ReturnType<typeof config>,
  firstPath: string,
): Promise<Array<{ id: string; attributes?: Record<string, unknown> }>> {
  const out: Array<{ id: string; attributes?: Record<string, unknown> }> = [];
  let next: string | null = `${API_BASE}/${firstPath.replace(/^\//, "")}`;
  while (next) {
    const res = await fetch(next, { headers: headers(cfg, false) });
    const text = await res.text();
    if (!res.ok) throw new Error(`GET ${next} → ${res.status} ${text.slice(0, 800)}`);
    const page = JSON.parse(text) as {
      data?: Array<{ id: string; attributes?: Record<string, unknown> }>;
      links?: { next?: string | null };
    };
    out.push(...(page.data ?? []));
    next = page.links?.next ?? null;
  }
  return out;
}

/** USER_DRAGGABLE hybrid template — editable in Klaviyo's visual editor. */
function emailHtml(args: {
  heading: string;
  body: string;
  cta: string;
  href: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#ffffff;">
<tr><td align="center" data-klaviyo-region="true" data-klaviyo-region-width-pixels="560">
<div class="klaviyo-block klaviyo-text-block" style="padding:32px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;font-weight:600;">Plott</div>
<div class="klaviyo-block klaviyo-text-block" style="padding:16px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:650;line-height:1.25;color:#18181b;">${args.heading}</div>
<div class="klaviyo-block klaviyo-text-block" style="padding:12px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#3f3f46;">Hi {{ first_name|default:"there" }},</div>
<div class="klaviyo-block klaviyo-text-block" style="padding:8px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#3f3f46;">${args.body}</div>
<div class="klaviyo-block klaviyo-text-block" style="padding:20px 32px;font-family:Arial,Helvetica,sans-serif;text-align:center;background-color:#fafafa;"><span style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Promo code</span><br><span style="font-family:Courier,monospace;font-size:26px;letter-spacing:0.08em;color:#18181b;"><strong>${PROMO_CODE}</strong></span><br><span style="font-size:13px;color:#71717a;">10% off your first month · New subscribers</span></div>
<div class="klaviyo-block klaviyo-text-block" style="padding:24px 32px 0;font-family:Arial,Helvetica,sans-serif;"><a href="${args.href}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600;">${args.cta}</a></div>
<div class="klaviyo-block klaviyo-text-block" style="padding:28px 32px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#a1a1aa;">Enter <strong>${PROMO_CODE}</strong> at Stripe checkout when you subscribe.<br>Built for UK builders and planning consultants.<br>Prefer a free resource first? <a href="${RESOURCE_URL}" style="color:#52525b;">Grab the checklist</a>.<br>Questions? Reply to this email.<br><br>{% unsubscribe 'Unsubscribe' %}</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

async function ensureList(cfg: ReturnType<typeof config>): Promise<string> {
  const lists = await listAll(cfg, "lists/");
  const existing = lists.find((l) => l.attributes?.name === LIST_NAME);
  if (existing) {
    console.log(`OK list exists: ${LIST_NAME} (${existing.id})`);
    return existing.id;
  }
  const created = await klaviyoFetch(cfg, "lists/", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "list",
        attributes: { name: LIST_NAME },
      },
    }),
  });
  const id = (created.data as { id: string }).id;
  console.log(`Created list: ${LIST_NAME} (${id})`);
  return id;
}

async function findMetricId(
  cfg: ReturnType<typeof config>,
  name: string,
): Promise<string> {
  const metrics = await listAll(cfg, "metrics/");
  const found = metrics.find((m) => m.attributes?.name === name);
  if (!found) {
    throw new Error(`Metric "${name}" not found in Klaviyo.`);
  }
  return found.id;
}

async function ensureTemplates(
  cfg: ReturnType<typeof config>,
  force: boolean,
): Promise<Record<(typeof TEMPLATE_SPECS)[number]["key"], string>> {
  const templates = await listAll(cfg, "templates/");
  const ids = {} as Record<(typeof TEMPLATE_SPECS)[number]["key"], string>;

  for (const spec of TEMPLATE_SPECS) {
    const existing = templates.find((t) => t.attributes?.name === spec.name);
    if (existing && !force) {
      ids[spec.key] = existing.id;
      console.log(`OK template exists: ${spec.name} (${existing.id})`);
      continue;
    }

    // USER_DRAGGABLE hybrids are not reliably PATCH'd; create a new library
    // template when forcing a refresh (then syncFlowEmailTemplates reclones).
    if (existing && force) {
      console.log(
        `Force: creating new library template (replacing ${existing.id} in flow sync)`,
      );
    }

    const created = await klaviyoFetch(cfg, "templates/", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "template",
          attributes: {
            name: force && existing ? `${spec.name} · ${Date.now()}` : spec.name,
            editor_type: "USER_DRAGGABLE",
            html: emailHtml(spec),
            text: `${spec.heading}\n\n${spec.body}\n\nPromo code: ${PROMO_CODE}\n\n${spec.cta}: ${spec.href}`,
          },
        },
      }),
    });
    const id = (created.data as { id: string }).id;
    ids[spec.key] = id;
    console.log(`Created template: ${spec.name} (${id})`);
  }

  return ids;
}

function metricNeverAllTime(metricId: string) {
  return {
    type: "profile-metric",
    metric_id: metricId,
    measurement: "count",
    measurement_filter: {
      type: "numeric",
      operator: "equals",
      value: 0,
    },
    timeframe_filter: {
      type: "date",
      operator: "alltime",
    },
    metric_filters: null,
  };
}

function delayDays(temporaryId: string, next: string, value: number) {
  return {
    temporary_id: temporaryId,
    type: "time-delay",
    links: { next },
    data: {
      unit: "days",
      value,
      secondary_value: 0,
      timezone: "profile",
      delay_until_time: null,
      delay_until_weekdays: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
    },
  };
}

function emailAction(args: {
  temporaryId: string;
  next: string | null;
  name: string;
  subject: string;
  preview: string;
  templateId: string;
  fromEmail: string;
  fromLabel: string;
  subscriptionMetricId: string;
  trialMetricId: string;
}) {
  return {
    temporary_id: args.temporaryId,
    type: "send-email",
    links: { next: args.next },
    data: {
      message: {
        name: args.name,
        from_email: args.fromEmail,
        from_label: args.fromLabel,
        reply_to_email: null,
        cc_email: null,
        bcc_email: null,
        subject_line: args.subject,
        preview_text: args.preview,
        template_id: args.templateId,
        smart_sending_enabled: true,
        transactional: false,
        add_tracking_params: true,
        custom_tracking_params: null,
        additional_filters: {
          condition_groups: [
            {
              conditions: [
                metricNeverAllTime(args.subscriptionMetricId),
                metricNeverAllTime(args.trialMetricId),
              ],
            },
          ],
        },
      },
      status: "draft",
    },
  };
}

/**
 * Flow send-email actions clone library templates into private template IDs.
 * Those clones are not updatable via Templates PATCH (404). To refresh copy,
 * re-point each action at the current library template_id so Klaviyo reclones.
 */
async function syncFlowEmailTemplates(
  cfg: ReturnType<typeof config>,
  flowId: string,
  templateIds: Record<(typeof TEMPLATE_SPECS)[number]["key"], string>,
) {
  const flow = await klaviyoFetch(
    cfg,
    `flows/${flowId}/?include=flow-actions`,
  );
  const included = (flow.included as Array<{
    type: string;
    id: string;
    attributes?: {
      definition?: {
        type?: string;
        data?: { message?: { subject_line?: string; template_id?: string } };
      };
    };
  }>) ?? [];

  const bySubject = new Map(
    TEMPLATE_SPECS.map((spec) => [spec.subject, templateIds[spec.key]] as const),
  );

  for (const action of included) {
    if (action.type !== "flow-action") continue;
    const def = action.attributes?.definition;
    if (def?.type !== "send-email") continue;

    const subject = def.data?.message?.subject_line;
    const libraryId = subject ? bySubject.get(subject) : undefined;
    if (!libraryId) {
      console.warn(
        `Skip flow action ${action.id}: no library template for subject "${subject ?? ""}"`,
      );
      continue;
    }

    const actionRes = await klaviyoFetch(cfg, `flow-actions/${action.id}/`);
    const fullDef = (
      actionRes.data as {
        attributes?: { definition?: Record<string, unknown> };
      }
    )?.attributes?.definition;
    if (!fullDef || typeof fullDef !== "object") {
      throw new Error(`Missing definition for flow-action ${action.id}`);
    }

    const data = fullDef.data as {
      message?: { template_id?: string };
    };
    if (!data?.message) {
      throw new Error(`Missing message on flow-action ${action.id}`);
    }

    data.message.template_id = libraryId;
    await klaviyoFetch(cfg, `flow-actions/${action.id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "flow-action",
          id: action.id,
          attributes: { definition: fullDef },
        },
      }),
    });
    console.log(
      `Synced flow email "${subject}" → library template ${libraryId}`,
    );
  }
}

async function ensureFlow(
  cfg: ReturnType<typeof config>,
  args: {
    listId: string;
    subscriptionMetricId: string;
    trialMetricId: string;
    templateIds: Record<(typeof TEMPLATE_SPECS)[number]["key"], string>;
    forceTemplates: boolean;
  },
) {
  const flows = await listAll(cfg, "flows/");
  const existing = flows.find((f) =>
    FLOW_NAMES.includes(
      String(f.attributes?.name ?? "") as (typeof FLOW_NAMES)[number],
    ),
  );
  if (existing) {
    const name = String(existing.attributes?.name ?? FLOW_NAME);
    console.log(`OK flow already exists: ${name} (${existing.id})`);
    console.log(`Status: ${String(existing.attributes?.status ?? "unknown")}`);
    if (args.forceTemplates) {
      await syncFlowEmailTemplates(cfg, existing.id, args.templateIds);
    }
    console.log(`Open: https://www.klaviyo.com/flow/${existing.id}/edit`);
    return existing.id;
  }

  const created = await klaviyoFetch(cfg, "flows/", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "flow",
        attributes: {
          name: FLOW_NAME,
          definition: {
            triggers: [
              {
                type: "list",
                id: args.listId,
              },
            ],
            profile_filter: {
              condition_groups: [
                {
                  conditions: [
                    metricNeverAllTime(args.subscriptionMetricId),
                    metricNeverAllTime(args.trialMetricId),
                  ],
                },
              ],
            },
            actions: [
              emailAction({
                temporaryId: "email-1",
                next: "delay-2d",
                name: "Email #1 — intro",
                subject: TEMPLATE_SPECS[0].subject,
                preview: TEMPLATE_SPECS[0].preview,
                templateId: args.templateIds.email1,
                fromEmail: cfg.fromEmail,
                fromLabel: cfg.fromLabel,
                subscriptionMetricId: args.subscriptionMetricId,
                trialMetricId: args.trialMetricId,
              }),
              delayDays("delay-2d", "email-2", 2),
              emailAction({
                temporaryId: "email-2",
                next: "delay-3d",
                name: "Email #2 — how it works",
                subject: TEMPLATE_SPECS[1].subject,
                preview: TEMPLATE_SPECS[1].preview,
                templateId: args.templateIds.email2,
                fromEmail: cfg.fromEmail,
                fromLabel: cfg.fromLabel,
                subscriptionMetricId: args.subscriptionMetricId,
                trialMetricId: args.trialMetricId,
              }),
              delayDays("delay-3d", "email-3", 3),
              emailAction({
                temporaryId: "email-3",
                next: null,
                name: "Email #3 — get started",
                subject: TEMPLATE_SPECS[2].subject,
                preview: TEMPLATE_SPECS[2].preview,
                templateId: args.templateIds.email3,
                fromEmail: cfg.fromEmail,
                fromLabel: cfg.fromLabel,
                subscriptionMetricId: args.subscriptionMetricId,
                trialMetricId: args.trialMetricId,
              }),
            ],
            entry_action_id: "email-1",
          },
        },
      },
    }),
  });

  const id = (created.data as { id: string }).id;
  console.log(`Created draft flow: ${FLOW_NAME} (${id})`);
  console.log(`Open: https://www.klaviyo.com/flow/${id}/edit`);
  console.log("Review copy, set Live, then import into the list.");
  return id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = config();

  console.log(`Using Klaviyo revision ${cfg.revision}`);
  const listId = await ensureList(cfg);
  const subscriptionMetricId = await findMetricId(cfg, "Subscription Started");
  const trialMetricId = await findMetricId(cfg, "Trial Started");
  const templateIds = await ensureTemplates(cfg, args.forceTemplates);
  await ensureFlow(cfg, {
    listId,
    subscriptionMetricId,
    trialMetricId,
    templateIds,
    forceTemplates: args.forceTemplates,
  });

  console.log("");
  console.log("Import target list:");
  console.log(`  ${LIST_NAME} (${listId})`);
  console.log(`  https://www.klaviyo.com/list/${listId}`);
  console.log(
    "When importing: subscribe profiles to email marketing, or only consented contacts will receive the series.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
