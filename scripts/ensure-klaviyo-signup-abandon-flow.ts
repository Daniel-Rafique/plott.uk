/**
 * Ensures the Klaviyo "Finished signup / didn't pay" metric flow exists.
 *
 * Creates CODE HTML templates + a draft metric-triggered flow via the Flows API:
 *   trigger: Onboarding Completed
 *   exit filter: no Subscription Started / Trial Started since flow start
 *   emails: +30m, +1d, +3d (relative delays)
 *
 * Required env:
 *   KLAVIYO_API_KEY
 *
 * Optional:
 *   KLAVIYO_API_REVISION (default 2026-04-15)
 *   KLAVIYO_FROM_EMAIL (default hi@plott.uk)
 *   KLAVIYO_FROM_LABEL (default Plott)
 *
 * Usage:
 *   npm run klaviyo:ensure-signup-abandon-flow
 *   npm run klaviyo:ensure-signup-abandon-flow -- --force-templates
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const API_BASE = "https://a.klaviyo.com/api";
const DEFAULT_REVISION = "2026-04-15";
const FLOW_NAME = "Finished signup / didn't pay";
const METRIC_NAME = "Onboarding Completed";
const SEED_EMAIL = "klaviyo-seed+onboarding@plott.uk";

const TEMPLATE_SPECS = [
  {
    key: "email1",
    name: "Plott · Signup abandon · Email 1 (workspace ready)",
    subject: "Your Plott workspace is ready — pick a plan",
    preview: "Finish setup and start finding planning leads.",
    heading: "Your workspace is ready",
    body: "You've set up your company details. Choose a plan to open the map, pin applications, and start outreach.",
    cta: "Choose a plan",
  },
  {
    key: "email2",
    name: "Plott · Signup abandon · Email 2 (reminder)",
    subject: "Still deciding? Pro is built for growing contractors",
    preview: "Ballpark outreach that stays behind your review step.",
    heading: "A quick reminder",
    body: "Plott helps you spot planning leads nearby, draft letters, and keep outreach behind your review step. Cancel anytime.",
    cta: "View plans",
  },
  {
    key: "email3",
    name: "Plott · Signup abandon · Email 3 (last nudge)",
    subject: "Last nudge — your Plott workspace is waiting",
    preview: "Starter ICP filters and letter templates are already set.",
    heading: "One last nudge",
    body: "Your starter filters and letter defaults are already in place from onboarding. Pick a plan when you're ready — billed at checkout, cancel anytime.",
    cta: "Continue to plans",
  },
] as const;

type Json = Record<string, unknown>;

function parseArgs(argv: string[]) {
  return {
    forceTemplates: argv.includes("--force-templates"),
  };
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
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${text.slice(0, 1200)}`);
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

function emailHtml(args: {
  heading: string;
  body: string;
  cta: string;
}): string {
  const subscribeUrl = "https://plott.uk/subscribe";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px;">
        <tr><td style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;font-weight:600;">Plott</td></tr>
        <tr><td style="padding-top:16px;font-size:24px;font-weight:650;line-height:1.25;">${args.heading}</td></tr>
        <tr><td style="padding-top:12px;font-size:16px;line-height:1.55;color:#3f3f46;">Hi {% first_name|default:'there' %},</td></tr>
        <tr><td style="padding-top:8px;font-size:16px;line-height:1.55;color:#3f3f46;">${args.body}</td></tr>
        <tr><td style="padding-top:24px;">
          <a href="${subscribeUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600;">${args.cta}</a>
        </td></tr>
        <tr><td style="padding-top:28px;font-size:12px;line-height:1.5;color:#a1a1aa;">Billed at checkout. Cancel anytime.<br>Questions? Reply to this email or write to hi@plott.uk.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function ensureMetric(
  cfg: ReturnType<typeof config>,
): Promise<{ id: string; created: boolean }> {
  const metrics = await listAll(cfg, "metrics/");
  const existing = metrics.find((m) => m.attributes?.name === METRIC_NAME);
  if (existing) return { id: existing.id, created: false };

  await klaviyoFetch(cfg, "events/", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "event",
        attributes: {
          properties: {
            seeded: true,
            funnel_stage: "needs_plan",
            has_paid: false,
          },
          metric: {
            data: {
              type: "metric",
              attributes: { name: METRIC_NAME },
            },
          },
          profile: {
            data: {
              type: "profile",
              attributes: { email: SEED_EMAIL },
            },
          },
          unique_id: `seed-${METRIC_NAME.toLowerCase().replace(/\s+/g, "-")}`,
        },
      },
    }),
  });

  // Metric indexing can lag briefly after first event.
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    const again = await listAll(cfg, "metrics/");
    const found = again.find((m) => m.attributes?.name === METRIC_NAME);
    if (found) return { id: found.id, created: true };
  }
  throw new Error(`Seeded ${METRIC_NAME} but metric ID not visible yet.`);
}

async function findMetricId(
  cfg: ReturnType<typeof config>,
  name: string,
): Promise<string> {
  const metrics = await listAll(cfg, "metrics/");
  const found = metrics.find((m) => m.attributes?.name === name);
  if (!found) {
    throw new Error(
      `Metric "${name}" not found. Complete a paid checkout once so Subscription Started exists, or seed it.`,
    );
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

    if (existing && force) {
      await klaviyoFetch(cfg, `templates/${existing.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "template",
            id: existing.id,
            attributes: {
              html: emailHtml(spec),
              text: `${spec.heading}\n\n${spec.body}\n\n${spec.cta}: https://plott.uk/subscribe`,
            },
          },
        }),
      });
      ids[spec.key] = existing.id;
      console.log(`Updated template: ${spec.name} (${existing.id})`);
      continue;
    }

    const created = await klaviyoFetch(cfg, "templates/", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "template",
          attributes: {
            name: spec.name,
            editor_type: "CODE",
            html: emailHtml(spec),
            text: `${spec.heading}\n\n${spec.body}\n\n${spec.cta}: https://plott.uk/subscribe`,
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

function metricNeverSinceFlowStart(metricId: string) {
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
      operator: "flow-start",
    },
    metric_filters: null,
  };
}

function delayAction(
  temporaryId: string,
  next: string,
  unit: "minutes" | "hours" | "days",
  value: number,
) {
  return {
    temporary_id: temporaryId,
    type: "time-delay",
    links: { next },
    data: {
      unit,
      value,
      secondary_value: 0,
      timezone: "profile",
      ...(unit === "days"
        ? {
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
          }
        : {}),
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
        // Account-completion reminder — not a promo blast.
        transactional: true,
        add_tracking_params: true,
        custom_tracking_params: null,
        additional_filters: {
          condition_groups: [
            {
              conditions: [
                metricNeverSinceFlowStart(args.subscriptionMetricId),
                metricNeverSinceFlowStart(args.trialMetricId),
              ],
            },
          ],
        },
      },
      status: "draft",
    },
  };
}

async function ensureFlow(
  cfg: ReturnType<typeof config>,
  args: {
    onboardingMetricId: string;
    subscriptionMetricId: string;
    trialMetricId: string;
    templateIds: Record<(typeof TEMPLATE_SPECS)[number]["key"], string>;
  },
) {
  const flows = await listAll(cfg, "flows/");
  const existing = flows.find((f) => f.attributes?.name === FLOW_NAME);
  if (existing) {
    console.log(`OK flow already exists: ${FLOW_NAME} (${existing.id})`);
    console.log(`Status: ${String(existing.attributes?.status ?? "unknown")}`);
    console.log(
      `Open: https://www.klaviyo.com/flow/${existing.id}/edit`,
    );
    return existing.id;
  }

  const entry = "delay-30m";
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
                type: "metric",
                id: args.onboardingMetricId,
                trigger_filter: null,
              },
            ],
            profile_filter: {
              condition_groups: [
                {
                  conditions: [
                    metricNeverSinceFlowStart(args.subscriptionMetricId),
                    metricNeverSinceFlowStart(args.trialMetricId),
                  ],
                },
              ],
            },
            actions: [
              delayAction(entry, "email-1", "minutes", 30),
              emailAction({
                temporaryId: "email-1",
                next: "delay-1d",
                name: "Email #1 — workspace ready",
                subject: TEMPLATE_SPECS[0].subject,
                preview: TEMPLATE_SPECS[0].preview,
                templateId: args.templateIds.email1,
                fromEmail: cfg.fromEmail,
                fromLabel: cfg.fromLabel,
                subscriptionMetricId: args.subscriptionMetricId,
                trialMetricId: args.trialMetricId,
              }),
              delayAction("delay-1d", "email-2", "days", 1),
              emailAction({
                temporaryId: "email-2",
                next: "delay-2d",
                name: "Email #2 — reminder",
                subject: TEMPLATE_SPECS[1].subject,
                preview: TEMPLATE_SPECS[1].preview,
                templateId: args.templateIds.email2,
                fromEmail: cfg.fromEmail,
                fromLabel: cfg.fromLabel,
                subscriptionMetricId: args.subscriptionMetricId,
                trialMetricId: args.trialMetricId,
              }),
              delayAction("delay-2d", "email-3", "days", 2),
              emailAction({
                temporaryId: "email-3",
                next: null,
                name: "Email #3 — last nudge",
                subject: TEMPLATE_SPECS[2].subject,
                preview: TEMPLATE_SPECS[2].preview,
                templateId: args.templateIds.email3,
                fromEmail: cfg.fromEmail,
                fromLabel: cfg.fromLabel,
                subscriptionMetricId: args.subscriptionMetricId,
                trialMetricId: args.trialMetricId,
              }),
            ],
            entry_action_id: entry,
          },
        },
      },
    }),
  });

  const id = (created.data as { id: string }).id;
  console.log(`Created draft flow: ${FLOW_NAME} (${id})`);
  console.log(`Open: https://www.klaviyo.com/flow/${id}/edit`);
  console.log("Review copy, then set Live in Klaviyo.");
  return id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = config();

  console.log(`Using Klaviyo revision ${cfg.revision}`);
  const onboarding = await ensureMetric(cfg);
  console.log(
    `${onboarding.created ? "Seeded" : "Found"} metric ${METRIC_NAME} (${onboarding.id})`,
  );

  const subscriptionMetricId = await findMetricId(cfg, "Subscription Started");
  const trialMetricId = await findMetricId(cfg, "Trial Started");
  console.log(`Exit metrics: Subscription Started=${subscriptionMetricId}, Trial Started=${trialMetricId}`);

  const templateIds = await ensureTemplates(cfg, args.forceTemplates);
  await ensureFlow(cfg, {
    onboardingMetricId: onboarding.id,
    subscriptionMetricId,
    trialMetricId,
    templateIds,
  });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
