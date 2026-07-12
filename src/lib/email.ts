/**
 * Transactional email via Resend. Falls back to console logging when
 * RESEND_API_KEY is unset (local dev without sending real mail).
 *
 * All emails use the brand color (#b09e7e) and editorial typography
 * to match the Plott marketing site aesthetic.
 */

import { sanitizeHtmlFragment } from "@/lib/sanitize-html";
import { BALLPARK_DISCLAIMER } from "@/lib/pipeline-shared";

type EmailAttachment = {
  filename: string;
  /** Raw bytes; will be base64-encoded for Resend. */
  content: Buffer;
  contentType?: string;
};

type SendArgs = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  tags?: { name: string; value: string }[];
  template?: {
    id: string;
    variables?: Record<string, string | number>;
  };
};

const FROM =
  process.env.EMAIL_FROM ??
  process.env.RESEND_FROM ??
  "Plott <hello@plott.uk>";

const AGENT_OUTREACH_TEMPLATE_ID =
  process.env.RESEND_AGENT_OUTREACH_TEMPLATE_ID ??
  "plott-agent-prospect-outreach";
const RESEND_TEMPLATE_STRING_LIMIT = 2_000;
export const BUSINESS_ADDRESS =
  process.env.BUSINESS_ADDRESS ?? "10 Buckhold Road London, SW18 4FW";

/** Brand color palette */
const BRAND = {
  main: "#b09e7e",
  dark: "#8f7e62",
  light: "#d4c9ba",
};

async function resendSend(args: SendArgs): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
    if (isProduction) {
      console.error("[email:error] RESEND_API_KEY not set in production — email NOT sent:", args.to, args.subject);
      throw new Error("RESEND_API_KEY not configured");
    }
    console.log("[email:dev]", args.to, args.subject);
    return null;
  }
  const payload: Record<string, unknown> = {
    from: FROM,
    to: [args.to],
    subject: args.subject,
    reply_to: args.replyTo,
  };
  if (args.template) {
    payload.template = args.template;
  } else {
    payload.html = args.html;
    payload.text = args.text;
  }
  if (args.tags && args.tags.length > 0) {
    payload.tags = args.tags;
  }
  if (args.attachments && args.attachments.length > 0) {
    payload.attachments = args.attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
      content_type: a.contentType,
    }));
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("Resend send failed", res.status, body);
    throw new Error(`Email send failed: ${res.status}`);
  }
  const body = await res.json().catch(() => null);
  return typeof body?.id === "string" ? body.id : null;
}

export async function sendInviteEmail(args: {
  to: string;
  companyName: string;
  inviterName: string;
  acceptUrl: string;
  inviteeStatus?: "existing" | "new";
}): Promise<void> {
  const isExisting = args.inviteeStatus === "existing";
  const ctaText = isExisting ? "Sign in to accept" : "Get started";
  const heading = isExisting
    ? `Sign in to join ${args.companyName}`
    : `You're invited to join ${args.companyName}`;
  const intro = isExisting
    ? `<strong>${escapeHtml(args.inviterName)}</strong> has invited you to join <strong>${escapeHtml(args.companyName)}</strong> on Plott. Sign in with your existing account to accept.`
    : `<strong>${escapeHtml(args.inviterName)}</strong> has invited you to join <strong>${escapeHtml(args.companyName)}</strong> on Plott — the UK's fastest way to turn planning applications into outreach.`;

  const body = `
    <p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      ${intro}
    </p>
    <p style="margin:28px 0;text-align:center;">
      ${ctaButton(args.acceptUrl, ctaText)}
    </p>
    <p style="margin:0 0 6px 0;font-size:12px;color:#71717a;line-height:1.6;">Or paste this link into your browser:</p>
    <p style="margin:0;font-size:12px;color:${BRAND.dark};word-break:break-all;line-height:1.5;">${escapeHtml(args.acceptUrl)}</p>`;
  await resendSend({
    to: args.to,
    subject: `Join ${args.companyName} on Plott`,
    html: brandedShell({ heading, body }),
  });
}

export async function sendPipelineAssignmentEmail(args: {
  to: string;
  assigneeName: string;
  assignerName: string;
  companyName: string;
  applicationRef: string | null;
  siteAddress: string | null;
  pipelineUrl: string;
}): Promise<void> {
  const refLine = args.applicationRef
    ? `<p style="margin:0 0 6px 0;font-size:14px;color:#18181b;font-weight:600;">${escapeHtml(args.applicationRef)}</p>`
    : "";
  const siteLine = args.siteAddress
    ? `<p style="margin:0;font-size:14px;color:#52525b;line-height:1.5;">${escapeHtml(args.siteAddress)}</p>`
    : "";

  const body = `
    <p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      Hi ${escapeHtml(args.assigneeName)},
    </p>
    <p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      <strong>${escapeHtml(args.assignerName)}</strong> assigned you a planning lead in <strong>${escapeHtml(args.companyName)}</strong>. You can review applicant details, update the stage, and add notes in Pipeline.
    </p>
    <div style="margin:0 0 24px 0;padding:18px 20px;border:1px solid #e4e4e7;border-left:3px solid ${BRAND.main};border-radius:10px;background:#fafafa;">
      ${refLine}
      ${siteLine}
    </div>
    <p style="margin:28px 0;text-align:center;">
      ${ctaButton(args.pipelineUrl, "Open in Pipeline")}
    </p>
    <p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;text-align:center;">
      Sent from ${escapeHtml(args.companyName)} via Plott.
    </p>`;

  await resendSend({
    to: args.to,
    subject: `Pipeline lead assigned: ${args.applicationRef ?? "Planning application"}`,
    html: brandedShell({
      heading: "New pipeline assignment",
      body,
    }),
    tags: [
      { name: "plott_owner", value: "pipeline" },
      { name: "plott_channel", value: "assignment" },
    ],
  });
}

type DigestApp = {
  entity: number;
  reference?: string;
  "address-text"?: string;
  description?: string;
  "planning-application-status"?: string;
  "planning-decision-type"?: string;
  "decision-date"?: string;
  enrichment?: {
    applicantName?: string | null;
    agentName?: string | null;
    confidence?: string | null;
  };
  ballpark?: {
    minGbp: number;
    maxGbp: number;
    weeks: number;
  } | null;
  contactQuality?: "high" | "medium" | "low" | "unknown";
  icpFit?: boolean;
};

function digestRow(
  app: DigestApp,
  baseUrl: string,
  savedSearchId: string,
): string {
  const ref = app.reference ?? "—";
  const status =
    app["planning-decision-type"] || app["planning-application-status"] || "";
  const addr = app["address-text"] ?? "";
  const desc = app.description ?? "";
  const applicant = app.enrichment?.applicantName
    ? `<div style="margin-top:6px;color:${BRAND.dark};font-size:12px;font-weight:500;">Applicant: ${escapeHtml(app.enrichment.applicantName)}</div>`
    : "";
  const quality =
    app.contactQuality && app.contactQuality !== "unknown"
      ? `<span style="margin-left:8px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#71717a;">Contact ${escapeHtml(app.contactQuality)}</span>`
      : "";
  const ballpark =
    app.ballpark != null
      ? `<div style="margin-top:8px;font-size:12px;color:#18181b;font-weight:500;">Ballpark £${Math.round(app.ballpark.minGbp).toLocaleString("en-GB")}–£${Math.round(app.ballpark.maxGbp).toLocaleString("en-GB")} · ~${app.ballpark.weeks} weeks</div><div style="margin-top:4px;font-size:11px;color:#71717a;line-height:1.45;">${escapeHtml(BALLPARK_DISCLAIMER)}</div>`
      : "";
  const sp = new URLSearchParams();
  sp.set("savedSearch", savedSearchId);
  sp.set("entity", String(app.entity));
  const link = `${baseUrl}/app/dashboard?${sp.toString()}`;
  const pipelineLink = `${baseUrl}/app/pipeline`;
  return `<a href="${escapeAttr(link)}" style="display:block;margin:0 0 12px 0;padding:16px 18px;border:1px solid #e4e4e7;border-left:3px solid ${BRAND.main};border-radius:10px;text-decoration:none;color:#18181b;transition:border-color 0.2s;">
    <div style="font-weight:600;font-size:14px;font-family:'Georgia',serif;">${escapeHtml(ref)} ${status ? `<span style="font-weight:500;color:${BRAND.dark};margin-left:8px;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(status)}</span>` : ""}${quality}</div>
    ${addr ? `<div style="color:#52525b;font-size:13px;margin-top:6px;">${escapeHtml(addr)}</div>` : ""}
    ${desc ? `<div style="color:#71717a;font-size:12px;margin-top:6px;line-height:1.5;">${escapeHtml(desc.slice(0, 180))}${desc.length > 180 ? "…" : ""}</div>` : ""}
    ${applicant}
    ${ballpark}
  </a>
  <div style="margin:-4px 0 14px 18px;font-size:11px;"><a href="${escapeAttr(pipelineLink)}" style="color:${BRAND.dark};">Track in pipeline →</a></div>`;
}

export async function sendDigestEmail(args: {
  to: string | string[];
  companyName: string;
  searchName: string;
  /** Saved search id for dashboard deep links. */
  savedSearchId: string;
  newApplications: DigestApp[];
  totalNew: number;
  /** Optional AI summary (intro paragraph + bullet highlights). */
  aiSummary?: { intro: string; highlights: string[] } | null;
}): Promise<void> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const count = args.totalNew;
  const ctaSp = new URLSearchParams();
  ctaSp.set("savedSearch", args.savedSearchId);
  const dashboardSearchUrl = `${baseUrl}/app/dashboard?${ctaSp.toString()}`;
  const rows = args.newApplications
    .map((a) => digestRow(a, baseUrl, args.savedSearchId))
    .join("");
  const summaryBlock = args.aiSummary
    ? `<div style="background:linear-gradient(135deg,${BRAND.light}22,${BRAND.main}15);border-left:3px solid ${BRAND.main};padding:16px 18px;border-radius:10px;margin:0 0 20px 0;">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.12em;color:${BRAND.dark};font-weight:600;margin-bottom:8px;">Summary</div>
        <p style="margin:0 0 ${args.aiSummary.highlights.length ? "10px" : "0"} 0;color:#18181b;font-size:14px;line-height:1.6;">${escapeHtml(args.aiSummary.intro)}</p>
        ${args.aiSummary.highlights.length
          ? `<ul style="margin:0;padding-left:18px;color:#3f3f46;font-size:13px;line-height:1.6;">${args.aiSummary.highlights
              .map((h) => `<li style="margin-bottom:4px;">${escapeHtml(h)}</li>`)
              .join("")}</ul>`
          : ""}
      </div>`
    : "";
  const body = `
    <div style="margin:0 0 20px 0;padding-bottom:16px;border-bottom:1px solid #e4e4e7;">
      <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${BRAND.dark};font-weight:600;">${escapeHtml(args.companyName)}</p>
      <p style="margin:6px 0 0 0;font-size:16px;font-weight:600;color:#18181b;font-family:'Georgia',serif;">${escapeHtml(args.searchName)}</p>
    </div>
    ${summaryBlock}
    ${rows}
    ${count > args.newApplications.length ? `<p style="color:#71717a;font-size:13px;margin-top:16px;text-align:center;">+ ${count - args.newApplications.length} more &mdash; open this search on the dashboard to browse the full set.</p>` : ""}
    <p style="margin:28px 0;text-align:center;">
      ${ctaButton(dashboardSearchUrl, "Open search on dashboard")}
    </p>
    <p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;text-align:center;">
      You're receiving this because you saved this search. <a href="${escapeAttr(`${baseUrl}/app/searches`)}" style="color:${BRAND.dark};text-decoration:underline;">Manage searches</a>
    </p>`;
  const html = brandedShell({ heading: `Your ${Math.min(count, args.newApplications.length)} best lead${count === 1 ? "" : "s"} this week`, body });
  const recipients = Array.isArray(args.to) ? args.to : [args.to];
  for (const to of recipients) {
    await resendSend({
      to,
      subject: `Your best leads — ${args.searchName}`,
      html,
    });
  }
}

export async function sendPinnedApplicationUpdateEmail(args: {
  to: string | string[];
  companyName: string;
  reference: string;
  siteAddress?: string | null;
  description?: string | null;
  changes: { field: string; before: unknown; after: unknown }[];
  applicationUrl?: string | null;
}): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const dashboardUrl = `${baseUrl}/app/dashboard`;
  const rows = args.changes
    .map((c) => {
      const label = c.field
        .replace(/([A-Z])/g, " $1")
        .replace(/_/g, " ")
        .trim();
      const before = c.before == null || c.before === "" ? "—" : String(c.before);
      const after = c.after == null || c.after === "" ? "—" : String(c.after);
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f4f4f5;font-size:12px;font-weight:600;color:#18181b;text-transform:capitalize;">${escapeHtml(label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f4f4f5;font-size:12px;color:#71717a;">${escapeHtml(before)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f4f4f5;font-size:12px;color:#18181b;font-weight:600;">${escapeHtml(after)}</td>
      </tr>`;
    })
    .join("");
  const site = args.siteAddress
    ? `<p style="margin:0 0 6px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Site:</strong> ${escapeHtml(args.siteAddress)}</p>`
    : "";
  const desc = args.description
    ? `<p style="margin:10px 0 0 0;font-size:13px;color:#71717a;line-height:1.55;">${escapeHtml(args.description.slice(0, 240))}${args.description.length > 240 ? "…" : ""}</p>`
    : "";
  const sourceLink = args.applicationUrl
    ? `<p style="margin:0 0 24px 0;text-align:center;">${ctaButton(args.applicationUrl, "Open council record")}</p>`
    : "";

  const body = `
    <div style="margin:0 0 20px 0;padding:18px 20px;border:1px solid #e4e4e7;border-left:3px solid ${BRAND.main};border-radius:10px;background:#fafafa;">
      <p style="margin:0 0 6px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Reference:</strong> ${escapeHtml(args.reference)}</p>
      ${site}
      ${desc}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e4e4e7;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;margin:0 0 24px 0;">
      <thead>
        <tr>
          <th align="left" style="padding:10px 12px;background:#fafafa;border-bottom:1px solid #e4e4e7;font-size:11px;color:${BRAND.dark};text-transform:uppercase;letter-spacing:0.08em;">Field</th>
          <th align="left" style="padding:10px 12px;background:#fafafa;border-bottom:1px solid #e4e4e7;font-size:11px;color:${BRAND.dark};text-transform:uppercase;letter-spacing:0.08em;">Before</th>
          <th align="left" style="padding:10px 12px;background:#fafafa;border-bottom:1px solid #e4e4e7;font-size:11px;color:${BRAND.dark};text-transform:uppercase;letter-spacing:0.08em;">Now</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${sourceLink}
    <p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;text-align:center;">
      You're receiving this because this application is pinned in ${escapeHtml(args.companyName)}. <a href="${escapeAttr(dashboardUrl)}" style="color:${BRAND.dark};text-decoration:underline;">Open dashboard</a>
    </p>`;
  const html = brandedShell({
    heading: `Pinned application changed`,
    body,
  });
  const recipients = Array.isArray(args.to) ? args.to : [args.to];
  for (const to of recipients) {
    await resendSend({
      to,
      subject: `Application update — ${args.reference}`,
      html,
    });
  }
}

export async function sendLetterReadyEmail(args: {
  to: string;
  letterId: string;
  recipientName: string;
  reference?: string | null;
  siteAddress?: string | null;
  pdfBuffer: Buffer;
  companyName: string;
  /**
   * When true the subject/heading emphasises auto-print (letter was marked
   * printed automatically). When false this is a manual "letter approved" email.
   */
  autoPrint?: boolean;
}): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const letterUrl = `${baseUrl}/app/letters?letter=${args.letterId}`;
  const refLine = args.reference
    ? `<p style="margin:0 0 6px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Reference:</strong> ${escapeHtml(args.reference)}</p>`
    : "";
  const siteLine = args.siteAddress
    ? `<p style="margin:0 0 6px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Site:</strong> ${escapeHtml(args.siteAddress)}</p>`
    : "";
  const heading = args.autoPrint
    ? "Letter printed & attached"
    : "Letter ready to print";
  const intro = args.autoPrint
    ? `Your letter to <strong>${escapeHtml(args.recipientName)}</strong> has been queued for auto-print. A PDF copy is attached for your records.`
    : `Your letter to <strong>${escapeHtml(args.recipientName)}</strong> is ready. Open the PDF attached to print it on your local printer.`;
  const body = `
    <p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      ${intro}
    </p>
    <div style="margin:0 0 24px 0;padding:18px 20px;border:1px solid #e4e4e7;border-left:3px solid ${BRAND.main};border-radius:10px;background:#fafafa;">
      <p style="margin:0 0 8px 0;font-size:14px;color:#18181b;font-weight:600;">To: ${escapeHtml(args.recipientName)}</p>
      ${refLine}
      ${siteLine}
    </div>
    <p style="margin:28px 0;text-align:center;">
      ${ctaButton(letterUrl, "Open in Plott")}
    </p>
    <p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;text-align:center;">
      Sent from ${escapeHtml(args.companyName)} via Plott.
    </p>`;
  const filename = args.reference
    ? `letter-${args.reference.replace(/[^a-z0-9._-]+/gi, "_")}.pdf`
    : `letter-${args.letterId}.pdf`;
  await resendSend({
    to: args.to,
    subject: args.autoPrint
      ? `Printed: letter to ${args.recipientName}`
      : `Letter ready: ${args.recipientName}`,
    html: brandedShell({ heading, body }),
    attachments: [
      {
        filename,
        content: args.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}

export async function sendOutreachEmail(args: {
  to: string;
  subject: string;
  bodyHtml: string;
  recipientName: string;
  companyName: string;
  replyTo?: string | null;
}): Promise<{ id: string | null }> {
  const safeBodyHtml = sanitizeHtmlFragment(args.bodyHtml);
  if (safeBodyHtml.length > RESEND_TEMPLATE_STRING_LIMIT) {
    throw new Error(
      "Agent outreach email body exceeds Resend template variable limit",
    );
  }
  const footerNote =
    "Business outreach regarding public planning records. Reply 'remove' to opt out.";
  const id = await resendSend({
    to: args.to,
    subject: args.subject,
    template: {
      id: AGENT_OUTREACH_TEMPLATE_ID,
      variables: {
        RECIPIENT_NAME: args.recipientName,
        OUTREACH_BODY_HTML: safeBodyHtml,
        COMPANY_NAME: args.companyName,
        FOOTER_NOTE: footerNote,
        BUSINESS_ADDRESS,
      },
    },
    tags: [
      { name: "plott_owner", value: "agent" },
      { name: "plott_channel", value: "prospect_outreach" },
    ],
    replyTo: args.replyTo ?? undefined,
  });
  return { id };
}

/** Branded HTML preview matching the Resend agent-outreach template layout. */
export function renderOutreachEmailPreviewHtml(args: {
  recipientName: string;
  subject: string;
  bodyHtml: string;
  companyName: string;
  footerNote?: string;
}): string {
  const safeBody = sanitizeHtmlFragment(args.bodyHtml);
  const footerNote =
    args.footerNote ??
    "Business outreach regarding public planning records. Reply 'remove' to opt out.";
  const body = `
    <p style="margin:0 0 8px 0;font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.06em;">From ${escapeHtml(args.companyName)}</p>
    <p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      Hi ${escapeHtml(args.recipientName)},
    </p>
    <div style="margin:0 0 24px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      ${safeBody}
    </div>
    <p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;">
      ${escapeHtml(footerNote)}<br />
      ${escapeHtml(BUSINESS_ADDRESS)}
    </p>`;
  return brandedShell({
    heading: args.subject,
    body,
    footerText: `Outreach from ${args.companyName} via Plott.`,
  });
}

/** Data from a related Letter, used to enrich follow-up reminder emails. */
export type ReminderEmailLetterContext = {
  applicationRef: string | null;
  /** Planning proposal / application title (letter subject). */
  subject: string;
  recipientName: string;
  siteAddress: string | null;
  addressLines: string;
  /** Letter purpose, e.g. `outreach` | `appeal_pitch`. */
  purpose: string;
};

function formatLetterPurpose(purpose: string): string {
  if (purpose === "appeal_pitch") return "Appeal pitch";
  if (purpose === "outreach") return "Outreach";
  return purpose.replace(/_/g, " ");
}

function buildReminderEmailSubject(args: {
  note: string;
  applicationRef: string | null | undefined;
  applicationTitle: string | undefined;
}): string {
  const ref = (args.applicationRef ?? "").trim();
  const title = (args.applicationTitle ?? "").trim();
  const max = 130;
  if (ref && title) {
    const s = `Reminder: ${ref} — ${title}`;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }
  if (ref) {
    const extra = args.note.trim();
    const s = `Reminder: ${ref}${extra ? ` — ${extra}` : ""}`;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }
  if (title) {
    const s = `Reminder: ${title}`;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }
  const s = `Reminder: ${args.note.trim() || "Plott"}`;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export async function sendReminderEmail(args: {
  to: string;
  note: string;
  /** When the follow-up was scheduled for (email sends on/after this date). */
  dueAt: Date;
  letterUrl?: string;
  companyName?: string;
  letter?: ReminderEmailLetterContext | null;
}): Promise<void> {
  const dueStr = args.dueAt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const L = args.letter;
  const subjectLine = L?.subject?.trim();
  const refLine = L?.applicationRef?.trim();
  const purposeLabel = L?.purpose ? formatLetterPurpose(L.purpose) : null;

  const detailRows: string[] = [];
  if (subjectLine) {
    detailRows.push(
      `<p style="margin:0 0 8px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Application:</strong> ${escapeHtml(subjectLine)}</p>`,
    );
  }
  if (refLine) {
    detailRows.push(
      `<p style="margin:0 0 8px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Reference:</strong> ${escapeHtml(refLine)}</p>`,
    );
  }
  if (L?.recipientName?.trim()) {
    detailRows.push(
      `<p style="margin:0 0 8px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">To (applicant):</strong> ${escapeHtml(L.recipientName.trim())}</p>`,
    );
  }
  if (L?.siteAddress?.trim()) {
    detailRows.push(
      `<p style="margin:0 0 8px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Site:</strong> ${escapeHtml(L.siteAddress.trim())}</p>`,
    );
  }
  if (L?.addressLines?.trim()) {
    const addr = escapeHtml(L.addressLines.trim()).replace(/\n/g, "<br/>");
    detailRows.push(
      `<p style="margin:0 0 8px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Correspondence address:</strong><br/>${addr}</p>`,
    );
  }
  if (purposeLabel) {
    detailRows.push(
      `<p style="margin:0 0 8px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Letter type:</strong> ${escapeHtml(purposeLabel)}</p>`,
    );
  }
  detailRows.push(
    `<p style="margin:0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Follow-up date:</strong> ${escapeHtml(dueStr)}</p>`,
  );

  const detailBlock =
    detailRows.length > 0
      ? `<div style="margin:0 0 24px 0;padding:18px 20px;border:1px solid #e4e4e7;border-left:3px solid ${BRAND.main};border-radius:10px;background:#fafafa;">
      ${detailRows.join("")}
    </div>`
      : `<p style="margin:0 0 20px 0;font-size:13px;color:#52525b;"><strong style="color:#18181b;">Follow-up date:</strong> ${escapeHtml(dueStr)}</p>`;

  const companyFooter = args.companyName
    ? `<p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;text-align:center;">
      ${escapeHtml(args.companyName)} · via Plott
    </p>`
    : `<p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;text-align:center;">
      Plott
    </p>`;

  const body = `
    <p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      ${escapeHtml(args.note)}
    </p>
    ${detailBlock}
    ${args.letterUrl ? `<p style="margin:28px 0;text-align:center;">${ctaButton(args.letterUrl, "Open in Plott")}</p>` : ""}
    ${companyFooter}`;

  const subj = buildReminderEmailSubject({
    note: args.note,
    applicationRef: L?.applicationRef,
    applicationTitle: L?.subject,
  });

  const textLines: string[] = [args.note, "", `Follow-up date: ${dueStr}`];
  if (L) {
    if (subjectLine) textLines.push(`Application: ${subjectLine}`);
    if (refLine) textLines.push(`Reference: ${refLine}`);
    if (L.recipientName?.trim()) textLines.push(`To (applicant): ${L.recipientName.trim()}`);
    if (L.siteAddress?.trim()) textLines.push(`Site: ${L.siteAddress.trim()}`);
    if (L.addressLines?.trim()) textLines.push(`Correspondence address: ${L.addressLines.trim()}`);
    if (purposeLabel) textLines.push(`Letter type: ${purposeLabel}`);
  }
  if (args.letterUrl) {
    textLines.push("", args.letterUrl);
  }
  if (args.companyName) {
    textLines.push("", `${args.companyName} · via Plott`);
  }

  await resendSend({
    to: args.to,
    subject: subj,
    html: brandedShell({ heading: "Reminder", body }),
    text: textLines.join("\n"),
  });
}

export async function sendVerificationEmail(args: {
  to: string;
  code: string;
  expiresInMinutes?: number;
}): Promise<void> {
  const minutes = args.expiresInMinutes ?? 10;
  const digits = args.code
    .split("")
    .map(
      (c) =>
        `<span style="display:inline-block;min-width:40px;padding:14px 6px;margin:0 4px;border-radius:10px;background:linear-gradient(180deg,#fafafa,#f4f4f5);border:1px solid #e4e4e7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:700;letter-spacing:0.1em;text-align:center;color:#18181b;">${escapeHtml(c)}</span>`,
    )
    .join("");
  const body = `
    <p style="margin:0 0 12px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      Enter this code in the app to verify your email and continue setting up your account.
    </p>
    <div style="margin:28px 0;text-align:center;">${digits}</div>
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;text-align:center;">
      This code expires in ${minutes} minutes. If you didn't request it, you can safely ignore this email.
    </p>`;
  await resendSend({
    to: args.to,
    subject: `${args.code} is your Plott verification code`,
    html: brandedShell({ heading: "Verify your email", body }),
  });
}

export async function sendSecondFactorCodeEmail(args: {
  to: string;
  code: string;
  expiresInMinutes?: number;
}): Promise<void> {
  const minutes = args.expiresInMinutes ?? 10;
  const digits = args.code
    .split("")
    .map(
      (c) =>
        `<span style="display:inline-block;min-width:40px;padding:14px 6px;margin:0 4px;border-radius:10px;background:linear-gradient(180deg,#fafafa,#f4f4f5);border:1px solid #e4e4e7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:700;letter-spacing:0.1em;text-align:center;color:#18181b;">${escapeHtml(c)}</span>`,
    )
    .join("");
  const body = `
    <p style="margin:0 0 12px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      Enter this code to finish signing in to Plott.
    </p>
    <div style="margin:28px 0;text-align:center;">${digits}</div>
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;text-align:center;">
      This code expires in ${minutes} minutes. If you didn't try to sign in, change your password and contact support.
    </p>`;
  await resendSend({
    to: args.to,
    subject: `${args.code} is your Plott sign-in code`,
    html: brandedShell({ heading: "Confirm your sign-in", body }),
  });
}

export async function sendContactSubmissionEmail(args: {
  source: "contact" | "support";
  fromName: string;
  fromEmail: string;
  company?: string | null;
  message: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const to =
    process.env.CONTACT_INBOX_EMAIL ?? "support@plott.uk";
  const label = args.source === "support" ? "Support" : "Contact";
  const meta: string[] = [];
  if (args.company) meta.push(`<strong>Company:</strong> ${escapeHtml(args.company)}`);
  if (args.ip) meta.push(`<strong>IP:</strong> ${escapeHtml(args.ip)}`);
  if (args.userAgent)
    meta.push(`<strong>UA:</strong> ${escapeHtml(args.userAgent.slice(0, 80))}`);
  const metaHtml = meta.length
    ? `<div style="margin:0 0 18px 0;font-size:11px;color:#71717a;line-height:1.7;">${meta.join(" · ")}</div>`
    : "";
  const bodyText = escapeHtml(args.message).replace(/\n/g, "<br/>");
  const body = `
    <div style="margin:0 0 6px 0;font-size:15px;font-weight:600;color:#18181b;">${escapeHtml(args.fromName)}</div>
    <div style="margin:0 0 18px 0;font-size:13px;"><a href="mailto:${escapeAttr(args.fromEmail)}" style="color:${BRAND.dark};text-decoration:underline;">${escapeHtml(args.fromEmail)}</a></div>
    ${metaHtml}
    <div style="border-top:1px solid #e4e4e7;padding-top:18px;font-size:14px;color:#18181b;white-space:pre-wrap;line-height:1.7;">${bodyText}</div>`;
  await resendSend({
    to,
    subject: `[${label}] ${args.fromName} — Plott`,
    html: brandedShell({ heading: `${label} form submission`, body }),
    replyTo: args.fromEmail,
  });
}

export async function sendPasswordResetEmail(args: {
  to: string;
  resetUrl: string;
  expiresInMinutes?: number;
}): Promise<void> {
  const minutes = args.expiresInMinutes ?? 60;
  const body = `
    <p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      We received a request to reset the password for your Plott account. Click the button below to choose a new one.
    </p>
    <p style="margin:28px 0;text-align:center;">
      ${ctaButton(args.resetUrl, "Reset password")}
    </p>
    <p style="margin:0 0 8px 0;font-size:12px;color:#71717a;line-height:1.6;">Or paste this link into your browser:</p>
    <p style="margin:0 0 20px 0;font-size:12px;color:${BRAND.dark};word-break:break-all;line-height:1.5;">${escapeHtml(args.resetUrl)}</p>
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;text-align:center;">
      This link expires in ${minutes} minutes. If you didn't request a reset, you can safely ignore this email.
    </p>`;
  await resendSend({
    to: args.to,
    subject: "Reset your Plott password",
    html: brandedShell({ heading: "Reset your password", body }),
  });
}

export async function sendMagicLinkEmail(args: {
  to: string;
  linkUrl: string;
  expiresInMinutes?: number;
}): Promise<void> {
  const minutes = args.expiresInMinutes ?? 15;
  const body = `
    <p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      Click the button below to finish signing in to Plott.
    </p>
    <p style="margin:28px 0;text-align:center;">
      ${ctaButton(args.linkUrl, "Sign in to Plott")}
    </p>
    <p style="margin:0 0 8px 0;font-size:12px;color:#71717a;line-height:1.6;">Or paste this link into your browser:</p>
    <p style="margin:0 0 20px 0;font-size:12px;color:${BRAND.dark};word-break:break-all;line-height:1.5;">${escapeHtml(args.linkUrl)}</p>
    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;text-align:center;">
      This link expires in ${minutes} minutes. If you didn't request it, you can safely ignore this email.
    </p>`;
  await resendSend({
    to: args.to,
    subject: "Sign in to Plott",
    html: brandedShell({ heading: "Your Plott sign-in link", body }),
  });
}

/** CTA button styled with brand color */
function ctaButton(href: string, label: string): string {
  return `<a href="${escapeAttr(href)}" style="display:inline-block;background:${BRAND.dark};color:#ffffff;padding:14px 28px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;letter-spacing:0.02em;">${escapeHtml(label)}</a>`;
}

/** Branded email shell with editorial typography and brand accents */
function brandedShell(args: {
  heading: string;
  body: string;
  footerText?: string;
}): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const footerText =
    args.footerText ??
    "You're receiving this because an account action was requested for this email.";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#18181b;-webkit-font-smoothing:antialiased;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="border:1px solid #e4e4e7;background:#ffffff;border-radius:16px;padding:36px 32px;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div style="margin-bottom:28px;padding-bottom:20px;border-bottom:1px solid #f4f4f5;">
        <img src="${baseUrl}/logo-7.png" alt="Plott" height="28" style="height:28px;width:auto;display:block;" />
      </div>
      <h1 style="margin:0 0 20px 0;font-size:24px;line-height:1.25;font-weight:600;font-family:'Georgia','Times New Roman',serif;color:#18181b;">${escapeHtml(args.heading)}</h1>
      ${args.body}
    </div>
    <div style="margin:24px 16px 0 16px;text-align:center;">
      <p style="margin:0 0 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:${BRAND.main};font-weight:600;">Plott</p>
      <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.6;">
        Turn UK planning applications into outreach.<br/>
        ${escapeHtml(footerText)}<br/>
        ${escapeHtml(BUSINESS_ADDRESS)}
      </p>
    </div>
  </div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * Transactional “subscription confirmed” — sent once after first successful
 * Checkout (see `trySendSubscriptionWelcomeEmail`).
 */
export async function sendSubscriptionWelcomeEmail(args: {
  to: string;
  companyName: string;
  isTrialing: boolean;
  trialEndsAt: Date | null;
}): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const dashboardUrl = `${baseUrl}/app/dashboard`;
  const supportUrl = `${baseUrl}/contact`;
  const trialLine =
    args.isTrialing && args.trialEndsAt
      ? `<p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">Your free trial is running until <strong>${escapeHtml(
          args.trialEndsAt.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        )}</strong>. You won’t be charged until then — change or cancel anytime in <strong>Settings → Billing</strong>.</p>`
      : `<p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">You now have full access for <strong>${escapeHtml(args.companyName)}</strong> — from natural-language map search to polished outreach letters, all in one place.</p>`;
  const body = `
    ${trialLine}
    <div style="margin:0 0 24px 0;padding:22px 24px;border-radius:14px;background:linear-gradient(145deg, #faf8f5 0%, #ffffff 55%);border:1px solid #e4e4e7;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
      <p style="margin:0 0 12px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:${BRAND.dark};font-weight:600;">Start here</p>
      <ul style="margin:0;padding-left:20px;font-size:14px;color:#3f3f46;line-height:1.75;">
        <li style="margin-bottom:6px;">Open the <strong>dashboard</strong> and search planning applications in your area</li>
        <li style="margin-bottom:6px;">Save a search to get <strong>weekly email digests</strong> of new matches</li>
        <li>Upgrade seats or invite your team from <strong>Settings</strong> when you need to</li>
      </ul>
    </div>
    <p style="margin:28px 0;text-align:center;">
      ${ctaButton(dashboardUrl, "Go to dashboard")}
    </p>
    <p style="margin:0;font-size:12px;color:#71717a;line-height:1.65;text-align:center;">
      Need a hand? <a href="${escapeAttr(supportUrl)}" style="color:${BRAND.dark};text-decoration:underline;">Contact support</a> — we read every message.
    </p>`;
  await resendSend({
    to: args.to,
    subject: `You’re in — Plott is ready for ${args.companyName}`,
    html: brandedShell({
      heading: "Welcome to Plott",
      body,
    }),
  });
}

export async function sendSubscriptionPlanChangedEmail(args: {
  to: string;
  companyName: string;
  planName: string;
  priceLabel: string | null;
  renewalDate: Date | null;
  includedAiCreditGbp: number | null;
}): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://plott.uk";
  const billingUrl = `${baseUrl}/app/settings/billing`;
  const renewalLabel = args.renewalDate
    ? args.renewalDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const details = [
    ["Plan", args.planName],
    ["Price", args.priceLabel],
    ["Renews", renewalLabel],
    [
      "Included AI credit",
      args.includedAiCreditGbp == null
        ? null
        : `£${args.includedAiCreditGbp}/month`,
    ],
  ].filter(([, value]) => value);
  const body = `
    <p style="margin:0 0 20px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      Your Plott subscription for <strong>${escapeHtml(args.companyName)}</strong> has been updated to <strong>${escapeHtml(args.planName)}</strong>.
    </p>
    <div style="margin:0 0 24px 0;padding:18px 20px;border-radius:14px;background:#fafafa;border:1px solid #e4e4e7;">
      ${details
        .map(
          ([label, value]) => `
            <p style="margin:0 0 10px 0;font-size:14px;color:#3f3f46;line-height:1.5;">
              <span style="display:inline-block;min-width:130px;color:#71717a;">${escapeHtml(label ?? "")}</span>
              <strong>${escapeHtml(value ?? "")}</strong>
            </p>`,
        )
        .join("")}
    </div>
    <p style="margin:0 0 24px 0;font-size:15px;color:#3f3f46;line-height:1.65;">
      Stripe applies the plan change immediately and handles any prorated charge or credit on your billing account.
    </p>
    <p style="margin:28px 0;text-align:center;">
      ${ctaButton(billingUrl, "View billing")}
    </p>`;
  await resendSend({
    to: args.to,
    subject: `Your Plott plan is now ${args.planName}`,
    html: brandedShell({
      heading: "Subscription updated",
      body,
      footerText:
        "You're receiving this because your Plott subscription was changed.",
    }),
  });
}
