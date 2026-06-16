/**
 * Improve PropertyData /address-match-uprn matching — their docs recommend commas
 * and a full postcode. @see https://propertydata.co.uk/api/documentation/address-match-uprn
 */

const LINE_POSTCODE = /^(.*)\s+([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i;

function normalizePostcodeSegment(pc: string): string {
  const m = pc.trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i);
  if (!m) return pc.trim();
  return `${m[1]} ${m[2]}`;
}

/**
 * Insert commas into an uncomma-separated UK line (best-effort).
 */
export function formatUkAddressForAddressMatching(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return t;
  if (t.includes(",")) return t;

  const m = t.match(LINE_POSTCODE);
  if (!m) return t;

  const beforePc = m[1].trim();
  const pc = normalizePostcodeSegment(m[2]);
  const parts = beforePc.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return pc;

  if (parts.length >= 2 && parts[parts.length - 1]?.toLowerCase() === "london") {
    const w = parts.slice(0, -1);
    if (w.length >= 4) {
      return `${w.slice(0, 2).join(" ")}, ${w.slice(2).join(" ")}, London, ${pc}`;
    }
    if (w.length >= 2) {
      return `${w.slice(0, -2).join(" ")}, ${w.slice(-2).join(" ")}, London, ${pc}`;
    }
    return `${w.join(" ")}, London, ${pc}`;
  }

  if (parts.length >= 3) {
    return `${parts.slice(0, 2).join(" ")}, ${parts.slice(2).join(" ")}, ${pc}`;
  }
  if (parts.length === 2) {
    return `${parts[0]}, ${parts[1]}, ${pc}`;
  }
  return `${beforePc}, ${pc}`;
}

/**
 * Extract the last token if it looks like a UK postcode, otherwise return null.
 */
export function extractPostcode(address: string): string | null {
  const m = address
    .trim()
    .match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i);
  return m ? normalizePostcodeSegment(m[1]) : null;
}

/**
 * True when a recognisable UK postcode appears **anywhere** in the string
 * (not just at the end). Used as a guard to decide whether an address is
 * worth sending to PropertyData.
 */
export function hasPostcode(address: string): boolean {
  return /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(address);
}

/** Ordered variants to try against address-matching APIs. */
export function ukAddressSearchVariants(address: string): string[] {
  const trimmed = address.replace(/\s+/g, " ").trim();
  const formatted = formatUkAddressForAddressMatching(trimmed);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [formatted, trimmed]) {
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}
