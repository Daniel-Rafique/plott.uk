import { isBodyOnlyHtml } from "@/lib/letter-renderer";

export type LetterBodyShapeIssue = {
  code: string;
  message: string;
};

export type LetterBodyShapeResult = {
  ok: boolean;
  issues: LetterBodyShapeIssue[];
};

const SALUTATION_PATTERN = /^\s*(<p[^>]*>)?\s*(dear|to whom it may concern)/i;
const SIGN_OFF_PATTERN =
  /yours\s+(faithfully|sincerely|kind regards|regards)/i;

const PARAGRAPH_PATTERN = /<p[^>]*>[\s\S]*?<\/p>/gi;

function paragraphText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAddressKey(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

function addressLineCandidates(addressLines: string): string[] {
  const raw = addressLines.trim();
  if (!raw) return [];

  const lines = raw
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = new Set<string>();

  for (const line of lines) {
    if (line.length > 6) candidates.add(normalizeAddressKey(line));
  }
  if (lines.length > 1) {
    candidates.add(normalizeAddressKey(lines.join(" ")));
    candidates.add(normalizeAddressKey(lines.join(", ")));
  }

  return [...candidates];
}

function extractParagraphs(html: string): string[] {
  const matches = html.match(PARAGRAPH_PATTERN);
  return matches ?? [];
}

function isSalutationParagraph(paragraphHtml: string): boolean {
  const text = paragraphText(paragraphHtml);
  return /^(dear\s|to whom it may concern)/i.test(text);
}

function isSignOffParagraph(paragraphHtml: string): boolean {
  const text = paragraphText(paragraphHtml);
  return /^(yours\s+(faithfully|sincerely)|kind regards|regards)\b/i.test(text);
}

function isAddressOnlyParagraph(
  paragraphHtml: string,
  addressLines: string,
): boolean {
  const text = normalizeAddressKey(paragraphText(paragraphHtml));
  if (text.length < 8) return false;

  return addressLineCandidates(addressLines).some(
    (candidate) => candidate.length > 8 && text === candidate,
  );
}

function stripLeadingSalutationParagraphs(html: string): string {
  let paragraphs = extractParagraphs(html);
  if (paragraphs.length === 0) {
    return html.replace(SALUTATION_PATTERN, "").trim();
  }

  while (paragraphs.length > 0 && isSalutationParagraph(paragraphs[0]!)) {
    paragraphs = paragraphs.slice(1);
  }

  return paragraphs.join("\n").trim();
}

function stripTrailingSignOffParagraphs(html: string): string {
  let paragraphs = extractParagraphs(html);
  if (paragraphs.length === 0) return html.trim();

  while (
    paragraphs.length > 0 &&
    isSignOffParagraph(paragraphs[paragraphs.length - 1]!)
  ) {
    paragraphs = paragraphs.slice(0, -1);
  }

  return paragraphs.join("\n").trim();
}

function stripAddressOnlyParagraphs(
  html: string,
  options?: { recipientAddressLines?: string | null; siteAddress?: string | null },
): string {
  const paragraphs = extractParagraphs(html);
  if (paragraphs.length === 0) return html.trim();

  const addressSources = [
    options?.recipientAddressLines,
    options?.siteAddress,
  ].filter((value): value is string => Boolean(value?.trim()));

  if (addressSources.length === 0) return html.trim();

  const kept = paragraphs.filter((paragraph) => {
    return !addressSources.some((address) =>
      isAddressOnlyParagraph(paragraph, address),
    );
  });

  return kept.join("\n").trim();
}

/**
 * Strip letter chrome that the renderer adds automatically (salutation, sign-off,
 * standalone address lines). Models often include these despite prompt rules.
 */
export function normalizeLetterBodyHtml(
  html: string,
  options?: {
    recipientAddressLines?: string | null;
    siteAddress?: string | null;
  },
): string {
  let normalized = html.trim();
  if (!normalized) return normalized;

  normalized = stripLeadingSalutationParagraphs(normalized);
  normalized = stripTrailingSignOffParagraphs(normalized);
  normalized = stripAddressOnlyParagraphs(normalized, options);

  return normalized.trim();
}

export function validateLetterBodyShape(
  html: string,
  options?: { recipientAddressLines?: string | null },
): LetterBodyShapeResult {
  const issues: LetterBodyShapeIssue[] = [];
  const trimmed = html.trim();

  if (!trimmed) {
    issues.push({ code: "empty", message: "Letter body is empty." });
    return { ok: false, issues };
  }

  if (!isBodyOnlyHtml(trimmed)) {
    issues.push({
      code: "document_scaffold",
      message:
        "Letter body must be a HTML fragment only (no full document, styles, or images).",
    });
  }

  if (SALUTATION_PATTERN.test(trimmed)) {
    issues.push({
      code: "salutation_in_body",
      message:
        "Do not include a salutation (e.g. Dear…) — it is added automatically on the letter.",
    });
  }

  if (SIGN_OFF_PATTERN.test(trimmed)) {
    issues.push({
      code: "sign_off_in_body",
      message:
        "Do not include a sign-off (e.g. Yours faithfully) — signature is added automatically.",
    });
  }

  const addressLines = options?.recipientAddressLines?.trim();
  if (addressLines && addressLines.length > 12) {
    const hasAddressOnlyParagraph = extractParagraphs(trimmed).some((paragraph) =>
      isAddressOnlyParagraph(paragraph, addressLines),
    );
    if (hasAddressOnlyParagraph) {
      issues.push({
        code: "address_in_body",
        message:
          "Do not repeat the postal address in the body — it appears in the letter header.",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Normalize model output, then validate the cleaned body-only fragment. */
export function prepareLetterBodyHtml(
  html: string,
  options?: {
    recipientAddressLines?: string | null;
    siteAddress?: string | null;
  },
): LetterBodyShapeResult & { html: string } {
  const normalized = normalizeLetterBodyHtml(html, options);
  const result = validateLetterBodyShape(normalized, {
    recipientAddressLines: options?.recipientAddressLines,
  });
  return { ...result, html: normalized };
}

export function assertBodyOnlyLetterHtml(
  html: string,
  options?: { recipientAddressLines?: string | null },
): void {
  const result = validateLetterBodyShape(html, options);
  if (!result.ok) {
    throw new Error(result.issues.map((i) => i.message).join(" "));
  }
}
