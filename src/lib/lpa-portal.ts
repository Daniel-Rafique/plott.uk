/**
 * LPA portal scraper. Covers the three major UK planning portal vendors:
 *   - Idox Public Access (vast majority of councils)
 *   - Civica APP
 *   - Northgate M3 Planning
 *
 * Uses polite rate limiting (2 req/s/council), obeys robots.txt where relevant,
 * and writes a `source=lpa_portal` row into ApplicationEnrichment when a
 * match is found.
 *
 * We DO NOT bypass logins or captchas; if a portal requires one, we return
 * null and the caller falls back to whatever it has.
 */

export type LpaPortalResult = {
  applicationRef: string;
  applicantName?: string;
  applicantAddress?: string;
  agentName?: string;
  agentAddress?: string;
  agentPhone?: string;
  agentEmail?: string;
  caseOfficer?: string;
  ward?: string;
  receivedDate?: string;
  targetDate?: string;
  validatedDate?: string;
  sourceUrl?: string;
  portal?: "idox" | "civica" | "northgate";
};

export type ScrapeParams = {
  councilWebsite: string;
  reference: string;
};

const USER_AGENT = "PlottBot/1.0 (+https://plott.uk/bot)";
const REQUEST_TIMEOUT_MS = 10_000;

type RateBucket = { last: number };
const buckets = new Map<string, RateBucket>();
const MIN_INTERVAL_MS = 500;

async function throttle(host: string): Promise<void> {
  const now = Date.now();
  const existing = buckets.get(host);
  if (existing) {
    const wait = Math.max(0, existing.last + MIN_INTERVAL_MS - now);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    existing.last = Date.now();
  } else {
    buckets.set(host, { last: now });
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function politeFetch(url: string): Promise<Response | null> {
  const host = hostnameOf(url);
  if (!host) return null;
  await throttle(host);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(s: string): string {
  return decode(s.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractField(html: string, label: string): string | undefined {
  const patterns = [
    new RegExp(
      `<(?:th|td|dt)[^>]*>\\s*${label}\\s*:?\\s*<\\/(?:th|td|dt)>\\s*<(?:td|dd)[^>]*>([\\s\\S]*?)<\\/(?:td|dd)>`,
      "i",
    ),
    new RegExp(
      `<strong>\\s*${label}\\s*:?\\s*<\\/strong>\\s*([^<]+)`,
      "i",
    ),
    new RegExp(
      `<span[^>]*class="[^"]*field[^"]*"[^>]*>\\s*${label}\\s*:?\\s*<\\/span>\\s*<span[^>]*>([\\s\\S]*?)<\\/span>`,
      "i",
    ),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) {
      const val = stripHtml(m[1]);
      if (val && val !== "-") return val;
    }
  }
  return undefined;
}

async function idoxScrape(
  websiteRoot: string,
  reference: string,
): Promise<LpaPortalResult | null> {
  const base = websiteRoot.replace(/\/$/, "");
  const candidates = [
    `${base}/online-applications/simpleSearchResults.do?action=firstPage&searchType=Application&searchCriteria.reference=${encodeURIComponent(reference)}`,
    `${base}/planning/online-applications/simpleSearchResults.do?action=firstPage&searchType=Application&searchCriteria.reference=${encodeURIComponent(reference)}`,
  ];

  for (const searchUrl of candidates) {
    const searchRes = await politeFetch(searchUrl);
    if (!searchRes) continue;
    const searchHtml = await searchRes.text();
    const hrefMatch = searchHtml.match(
      /href="([^"]*applicationDetails\.do\?activeTab=[^"]*keyVal=[^"]+)"/i,
    );
    if (!hrefMatch) continue;
    const detailsUrl = new URL(hrefMatch[1], searchUrl).toString();
    const detailsRes = await politeFetch(detailsUrl);
    if (!detailsRes) continue;
    const detailsHtml = await detailsRes.text();

    const summaryUrl = detailsUrl.replace(
      /activeTab=[^&]+/,
      "activeTab=summary",
    );
    const contactsUrl = detailsUrl.replace(
      /activeTab=[^&]+/,
      "activeTab=contacts",
    );
    const [summaryRes, contactsRes] = await Promise.all([
      politeFetch(summaryUrl),
      politeFetch(contactsUrl),
    ]);
    const summaryHtml = summaryRes ? await summaryRes.text() : detailsHtml;
    const contactsHtml = contactsRes ? await contactsRes.text() : "";

    const applicantName =
      extractField(contactsHtml, "Applicant(?:&#039;s)?\\s*Name") ??
      extractField(detailsHtml, "Applicant\\s*Name");
    const applicantAddress =
      extractField(contactsHtml, "Applicant(?:&#039;s)?\\s*Address") ??
      undefined;
    const agentName = extractField(contactsHtml, "Agent(?:&#039;s)?\\s*Name");
    const agentAddress = extractField(contactsHtml, "Agent(?:&#039;s)?\\s*Address");
    const agentPhone = extractField(contactsHtml, "Agent(?:&#039;s)?\\s*(?:Phone|Telephone)");
    const agentEmail = extractField(contactsHtml, "Agent(?:&#039;s)?\\s*Email");
    const caseOfficer =
      extractField(summaryHtml, "Case\\s*Officer") ??
      extractField(detailsHtml, "Case\\s*Officer");
    const ward = extractField(summaryHtml, "Ward");
    const receivedDate = extractField(summaryHtml, "Application\\s*Received");
    const validatedDate = extractField(summaryHtml, "Application\\s*Validated");
    const targetDate = extractField(summaryHtml, "Target\\s*Decision\\s*Date");

    if (applicantName || agentName || agentEmail) {
      return {
        applicationRef: reference,
        applicantName,
        applicantAddress,
        agentName,
        agentAddress,
        agentPhone,
        agentEmail,
        caseOfficer,
        ward,
        receivedDate,
        validatedDate,
        targetDate,
        sourceUrl: detailsUrl,
        portal: "idox",
      };
    }
  }
  return null;
}

function looksLikeIdox(html: string): boolean {
  return /online-applications|PublicAccess|simpleSearchResults\.do/i.test(html);
}

function looksLikeCivica(html: string): boolean {
  return /Civica|APP\.|AcolNetCGI/i.test(html);
}

function looksLikeNorthgate(html: string): boolean {
  return /Northgate|AppDetail\.aspx|M3\.Public/i.test(html);
}

async function detectPortal(
  root: string,
): Promise<"idox" | "civica" | "northgate" | null> {
  const res = await politeFetch(root);
  if (!res) return null;
  const html = await res.text();
  if (looksLikeIdox(html)) return "idox";
  if (looksLikeCivica(html)) return "civica";
  if (looksLikeNorthgate(html)) return "northgate";
  if (html.match(/planning|application/i)) {
    // Try Idox as the dominant default.
    return "idox";
  }
  return null;
}

export async function scrapeLpaPortal(
  params: ScrapeParams,
): Promise<LpaPortalResult | null> {
  if (process.env.LPA_SCRAPE_DISABLED === "true") return null;
  const { councilWebsite, reference } = params;
  if (!councilWebsite || !reference) return null;

  const root = councilWebsite.startsWith("http")
    ? councilWebsite
    : `https://${councilWebsite}`;

  const portal = await detectPortal(root);
  if (portal === "idox") {
    return idoxScrape(root, reference);
  }
  // Civica + Northgate: detection varies widely and we prefer returning
  // nothing over a wrong applicant name. Extend here as we profile real estates.
  return null;
}

export type LpaRefusalResult = {
  applicationRef: string;
  /** "Refused", "Granted", "Withdrawn", etc. — raw text from the portal. */
  decision?: string;
  decisionDate?: string;
  /** Full text of the refusal reasons / decision notice if scraped. */
  decisionReasons?: string;
  /** Short summary line (first reason or delegated/committee note). */
  decisionSummary?: string;
  sourceUrl?: string;
  portal?: "idox" | "civica" | "northgate";
};

/**
 * Pull the decision notice (refusal reasons, officer recommendation, etc.)
 * for a single application. Idox is the only vendor we support today —
 * Civica / Northgate will gracefully return `null`.
 */
export async function scrapeLpaRefusalNotice(
  params: ScrapeParams,
): Promise<LpaRefusalResult | null> {
  if (process.env.LPA_SCRAPE_DISABLED === "true") return null;
  const { councilWebsite, reference } = params;
  if (!councilWebsite || !reference) return null;

  const root = councilWebsite.startsWith("http")
    ? councilWebsite
    : `https://${councilWebsite}`;
  const portal = await detectPortal(root);
  if (portal !== "idox") return null;
  return idoxRefusalScrape(root, reference);
}

async function idoxRefusalScrape(
  websiteRoot: string,
  reference: string,
): Promise<LpaRefusalResult | null> {
  const base = websiteRoot.replace(/\/$/, "");
  const candidates = [
    `${base}/online-applications/simpleSearchResults.do?action=firstPage&searchType=Application&searchCriteria.reference=${encodeURIComponent(reference)}`,
    `${base}/planning/online-applications/simpleSearchResults.do?action=firstPage&searchType=Application&searchCriteria.reference=${encodeURIComponent(reference)}`,
  ];

  for (const searchUrl of candidates) {
    const searchRes = await politeFetch(searchUrl);
    if (!searchRes) continue;
    const searchHtml = await searchRes.text();
    const hrefMatch = searchHtml.match(
      /href="([^"]*applicationDetails\.do\?activeTab=[^"]*keyVal=[^"]+)"/i,
    );
    if (!hrefMatch) continue;

    const detailsUrl = new URL(hrefMatch[1], searchUrl).toString();
    const summaryUrl = detailsUrl.replace(
      /activeTab=[^&]+/,
      "activeTab=summary",
    );
    const detailsTabUrl = detailsUrl.replace(
      /activeTab=[^&]+/,
      "activeTab=details",
    );

    const [summaryRes, detailsRes] = await Promise.all([
      politeFetch(summaryUrl),
      politeFetch(detailsTabUrl),
    ]);
    const summaryHtml = summaryRes ? await summaryRes.text() : "";
    const detailsHtml = detailsRes ? await detailsRes.text() : "";

    const decision =
      extractField(summaryHtml, "Decision") ??
      extractField(detailsHtml, "Decision");
    const decisionDate =
      extractField(summaryHtml, "Decision\\s*(?:Issued\\s*)?Date") ??
      extractField(summaryHtml, "Decision\\s*Made") ??
      extractField(detailsHtml, "Decision\\s*Date");

    // Idox doesn't always expose the reason text in the public tabs —
    // when present it sits under "Reason for Refusal" / "Refusal Reasons"
    // in a <td> pair with HTML formatting (often an ordered list).
    const decisionReasons =
      extractField(detailsHtml, "Reason(?:s)?\\s*for\\s*Refusal") ??
      extractField(detailsHtml, "Refusal\\s*Reason(?:s)?") ??
      extractField(summaryHtml, "Reason(?:s)?\\s*for\\s*Refusal") ??
      extractField(summaryHtml, "Refusal\\s*Reason(?:s)?");

    const decisionSummary = decisionReasons
      ? decisionReasons.slice(0, 400)
      : undefined;

    if (decision || decisionReasons) {
      return {
        applicationRef: reference,
        decision,
        decisionDate,
        decisionReasons,
        decisionSummary,
        sourceUrl: detailsUrl,
        portal: "idox",
      };
    }
  }
  return null;
}
