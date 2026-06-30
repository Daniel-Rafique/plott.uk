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
    const firstLine = addressLines.split(/\n+/)[0]?.trim();
    if (firstLine && firstLine.length > 8 && trimmed.includes(firstLine)) {
      issues.push({
        code: "address_in_body",
        message:
          "Do not repeat the postal address in the body — it appears in the letter header.",
      });
    }
  }

  return { ok: issues.length === 0, issues };
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
