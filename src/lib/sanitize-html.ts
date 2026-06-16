const STRIP_CONTENT_TAGS =
  /<\s*(script|style|iframe|object|embed|link|meta|title|svg|math|foreignObject)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const STRIP_SVG_CONTENT_TAGS =
  /<\s*(script|style|iframe|object|embed|link|meta|title|foreignObject)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const DROP_DANGEROUS_ATTRS =
  /\s(?:on\w+|style|srcdoc)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DROP_DANGEROUS_URLS = /\s(?:href|src|xlink:href)\s*=\s*(?:"\s*(?:javascript|data:text\/html)[^"]*"|'\s*(?:javascript|data:text\/html)[^']*'|(?:javascript|data:text\/html)[^\s>]*)/gi;

const ALLOWED_FRAGMENT_TAGS = new Set([
  "p",
  "br",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "h3",
  "h4",
  "a",
]);

function isSafeHref(href: string): boolean {
  const trimmed = href.trim().replace(/[\u0000-\u001f\u007f\s]+/g, "");
  return /^(https?:|mailto:|tel:|\/|#)/i.test(trimmed);
}

function readHref(attrs: string): string | null {
  const match = attrs.match(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Small allowlist sanitizer for body-only letter fragments. It intentionally
 * preserves text content while stripping unknown tags and all attributes except
 * safe anchor hrefs.
 */
export function sanitizeHtmlFragment(html: string): string {
  return html
    .replace(STRIP_CONTENT_TAGS, "")
    .replace(DROP_DANGEROUS_ATTRS, "")
    .replace(DROP_DANGEROUS_URLS, "")
    .replace(/<\s*(\/?)\s*([a-zA-Z][\w:-]*)([^>]*)>/g, (_tag, slash: string, rawName: string, attrs: string) => {
      const name = rawName.toLowerCase();
      if (!ALLOWED_FRAGMENT_TAGS.has(name)) return "";
      if (slash) return name === "br" ? "" : `</${name}>`;
      if (name === "br") return "<br />";
      if (name === "a") {
        const href = readHref(attrs);
        if (!href || !isSafeHref(href)) return "<a>";
        return `<a href="${escapeAttr(href)}">`;
      }
      return `<${name}>`;
    });
}

/** Defensive cleanup for signature-pad SVG before storing or rendering inline. */
export function sanitizeInlineSvg(svg: string): string {
  return svg
    .replace(STRIP_SVG_CONTENT_TAGS, "")
    .replace(DROP_DANGEROUS_ATTRS, "")
    .replace(DROP_DANGEROUS_URLS, "");
}
