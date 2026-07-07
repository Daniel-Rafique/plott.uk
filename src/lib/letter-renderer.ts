/**
 * Server-rendered A4 letter HTML. Returned by /api/letter/draft and used as
 * the canvas for /api/letter/pdf. Company-scoped: pulls logo + signature +
 * footer from the tenant.
 */

import type { Company } from "@prisma/client";
import { sanitizeHtmlFragment, sanitizeInlineSvg } from "@/lib/sanitize-html";

export type LetterInput = {
  company: Company;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    signatureSvg?: string | null;
    signatureBlobUrl?: string | null;
    signatoryTitle?: string | null;
  };
  addresseeName: string;
  addressLines: string;
  reference?: string;
  description?: string;
  planningUrl?: string;
  siteAddress?: string;
  /** Enriched contact context. All optional — used by templates via merge fields. */
  contactKind?: "agent" | "applicant" | "proprietor" | "manual";
  applicantName?: string | null;
  agentName?: string | null;
  agentAddress?: string | null;
  agentEmail?: string | null;
  agentPhone?: string | null;
  caseOfficer?: string | null;
  ward?: string | null;
  /** HTML body from a LetterTemplate. Merge fields replaced if present. */
  templateBodyHtml?: string | null;
  templateSubject?: string | null;
  /**
   * Optional overrides for embedding logo/signature. Use:
   *   - undefined (default) → use the in-app proxy URL (authenticated viewers)
   *   - a data URI (e.g. "data:image/png;base64,…") → inline (for emails)
   *   - null → omit the image entirely
   */
  logoSrcOverride?: string | null;
  signatureSrcOverride?: string | null;
};

/**
 * Anything that looks like document scaffolding or injected assets. Letter
 * bodies must be HTML fragments only — the letterhead, signature and footer
 * are composed server-side. Any attempt to persist a full document (e.g. from
 * a legacy client or a compromised AI output) is rejected.
 */
const BODY_ONLY_FORBIDDEN =
  /<(?:!doctype|html|head|body|style|img|script|iframe|link|meta|title)\b/i;

export function isBodyOnlyHtml(html: string): boolean {
  return !BODY_ONLY_FORBIDDEN.test(html);
}

/**
 * HTML → plain text used by the PDF path (`@react-pdf/renderer` wants a
 * string, not markup). Centralised so the PDF, bulk-PDF, and email-delivery
 * paths share one implementation.
 */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|br)>/gi, "\n\n")
    .replace(/<br[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type MergeField =
  | "addresseeName"
  | "applicant"
  | "applicantName"
  | "agentName"
  | "agentAddress"
  | "agentEmail"
  | "agentPhone"
  | "caseOfficer"
  | "ward"
  | "contactKind"
  | "reference"
  | "siteAddress"
  | "description"
  | "planningUrl"
  | "companyName"
  | "companyUrl"
  | "signerName"
  | "signerTitle"
  | "date";

type MergeMap = Partial<Record<MergeField, string>>;

function applyMerge(body: string, vars: MergeMap): string {
  return body.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key: string) => {
    if (key in vars) return esc(String(vars[key as keyof MergeMap] ?? ""));
    return match;
  });
}

function formatDate(d = new Date()): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function addressLinesHtml(s: string): string {
  return s.split(/\n+/).map(esc).join("<br />");
}

function resolveLogoSrc(
  company: Company,
  override: string | null | undefined,
): string | null {
  if (override === null) return null;
  if (typeof override === "string" && override.length > 0) return override;
  if (!company.logoBlobUrl) return null;
  // Default: use the authenticated in-app proxy
  return "/api/company/logo/view";
}

function headerBlock(company: Company, logoSrc: string | null): string {
  const logo = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="${esc(company.name)} logo" class="logo" />`
    : "";
  const contactLines = [
    company.name,
    company.addressLines,
    [company.phone, company.email].filter(Boolean).join(" · "),
    company.websiteUrl,
  ]
    .filter((s): s is string => Boolean(s?.trim()))
    .map(esc)
    .join("<br />");

  return `<header class="hdr">
    <div class="hdr-logo">${logo}</div>
    <div class="hdr-addr">${contactLines}</div>
  </header>`;
}

function signatureBlock(
  user: LetterInput["user"],
  company: Company,
  sigSrcOverride: string | null | undefined,
): string {
  const signerName = user.name ?? company.name;
  const signerTitle = user.signatoryTitle ?? "Director";
  let sigVisual = "";
  if (user.signatureSvg && user.signatureSvg.trim().startsWith("<svg")) {
    sigVisual = `<div class="sig-img">${sanitizeInlineSvg(user.signatureSvg)}</div>`;
  } else if (sigSrcOverride !== null) {
    const src =
      typeof sigSrcOverride === "string" && sigSrcOverride.length > 0
        ? sigSrcOverride
        : user.signatureBlobUrl
          ? "/api/user/signature/view"
          : null;
    if (src) {
      sigVisual = `<img src="${esc(src)}" alt="Signature" class="sig-img" />`;
    }
  }
  return `<div class="sig">
    ${sigVisual}
    <div><strong>${esc(signerName)}</strong></div>
    <div class="sig-title">${esc(signerTitle)}, ${esc(company.name)}</div>
  </div>`;
}

function footerBlock(company: Company): string {
  const compliance =
    "This letter is generated for business outreach regarding public planning records. Direct marketing must comply with UK GDPR and PECR; registered proprietor data may differ from current occupants.";
  const custom = company.letterFooter?.trim();
  return `<footer class="ftr"><p>${esc(custom ?? compliance)}</p></footer>`;
}

function defaultBody(i: LetterInput): string {
  const parts = [
    `<p>Dear ${esc(i.addresseeName)},</p>`,
    `<p>We are writing regarding the planning matter at the address shown. ${
      i.description
        ? `The proposal is described as: ${esc(i.description)}.`
        : "We understand a planning application has been submitted for this site."
    }</p>`,
    `<p>${esc(i.company.name)} provides construction services. If you are considering appointing a contractor or would like a no-obligation discussion about the works, we would be pleased to hear from you.</p>`,
  ];
  return parts.join("\n");
}

export function renderLetterHtml(i: LetterInput): {
  html: string;
  subject: string;
  body: string;
} {
  const mergeVars: MergeMap = {
    addresseeName: i.addresseeName,
    applicant: i.applicantName ?? i.addresseeName,
    applicantName: i.applicantName ?? "",
    agentName: i.agentName ?? "",
    agentAddress: i.agentAddress ?? "",
    agentEmail: i.agentEmail ?? "",
    agentPhone: i.agentPhone ?? "",
    caseOfficer: i.caseOfficer ?? "",
    ward: i.ward ?? "",
    contactKind: i.contactKind ?? "",
    reference: i.reference ?? "",
    siteAddress: i.siteAddress ?? "",
    description: i.description ?? "",
    planningUrl: i.planningUrl ?? "",
    companyName: i.company.name,
    companyUrl: i.company.websiteUrl ?? "",
    signerName: i.user.name ?? "",
    signerTitle: i.user.signatoryTitle ?? "",
    date: formatDate(),
  };

  // Run templateSubject through applyMerge so saved templates like
  // "{{companyName}} — planning application {{reference}}" resolve at render
  // time. The default fallback strings are plain text (no merge fields).
  const rawSubject =
    i.templateSubject?.trim() ||
    (i.reference
      ? `${i.company.name} — planning application ${i.reference}`
      : `${i.company.name} — introduction`);
  const subject = applyMerge(rawSubject, mergeVars);

  const body = i.templateBodyHtml
    ? sanitizeHtmlFragment(applyMerge(i.templateBodyHtml, mergeVars))
    : defaultBody(i);

  const reLine = i.reference ? `<p class="re"><strong>Re: ${esc(i.reference)}</strong>
  ${i.siteAddress ? `<br /><span class="site">${esc(i.siteAddress)}</span>` : ""}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(subject)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap');
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.55;
      color: #18181b;
      max-width: 210mm;
      min-height: calc(297mm - 36mm);
      margin: 0 auto;
      padding: 12mm;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
      font-variant-numeric: lining-nums;
    }
    .main { flex: 1; display: flex; flex-direction: column; }
    .body-content { flex: 1; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; gap: 24pt; padding-bottom: 12pt; border-bottom: 1pt solid #e4e4e7; }
    .hdr-logo .logo { max-height: 72pt; max-width: 180pt; object-fit: contain; }
    .hdr-addr { text-align: right; font-size: 9pt; color: #52525b; line-height: 1.45; font-variant-numeric: tabular-nums lining-nums; }
    .date { margin-top: 16pt; font-variant-numeric: tabular-nums lining-nums; }
    .addr { margin-top: 24pt; }
    .re { margin-top: 14pt; font-weight: 600; letter-spacing: -0.005em; }
    .re .site { display: block; margin-top: 2pt; font-size: 10pt; font-weight: 400; color: #52525b; letter-spacing: 0; }
    p { margin: 0 0 10pt 0; }
    .sig { margin-top: 28pt; }
    img.sig-img {
      display: block;
      max-height: 60pt;
      max-width: 220pt;
      width: auto;
      height: auto;
      object-fit: contain;
      object-position: left bottom;
      margin-bottom: 4pt;
    }
    .sig-img svg {
      display: block;
      max-height: 60pt;
      max-width: 220pt;
      width: auto;
      height: auto;
      margin-bottom: 4pt;
    }
    .sig-title { font-size: 9pt; color: #52525b; }
    .ftr { margin-top: 36pt; padding-top: 12pt; border-top: 1pt solid #e4e4e7; font-size: 8pt; color: #71717a; }
    a { color: #18181b; text-decoration: underline; text-decoration-color: #d4d4d8; text-underline-offset: 2px; }
    a:hover { text-decoration-color: #18181b; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${headerBlock(i.company, resolveLogoSrc(i.company, i.logoSrcOverride))}
  <main class="main">
    <div class="body-content">
      <p class="date">${esc(formatDate())}</p>
      <p class="addr">${esc(i.addresseeName)}<br />${addressLinesHtml(i.addressLines)}</p>
      ${reLine}
      ${body}
    </div>
    ${signatureBlock(i.user, i.company, i.signatureSrcOverride)}
  </main>
  ${footerBlock(i.company)}
</body>
</html>`;

  return { html, subject, body };
}
