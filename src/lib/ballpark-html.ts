/**
 * Pure HTML helpers for indicative ballpark paragraphs.
 * Safe for client and server — no Prisma / AI imports.
 */

import { BALLPARK_DISCLAIMER } from "@/lib/pipeline";

export function ballparkParagraphHtml(args: {
  minGbp: number;
  maxGbp: number;
  weeks: number;
}): string {
  const range =
    args.minGbp === args.maxGbp
      ? `£${Math.round(args.minGbp).toLocaleString("en-GB")}`
      : `£${Math.round(args.minGbp).toLocaleString("en-GB")}–£${Math.round(args.maxGbp).toLocaleString("en-GB")}`;
  const weeksLabel =
    args.weeks === 1 ? "about 1 week" : `about ${args.weeks} weeks`;
  return `<p>For a project like yours, we would typically expect works in the region of <strong>${range}</strong> over ${weeksLabel}. ${BALLPARK_DISCLAIMER}</p>`;
}

/** Remove any paragraph that contains the ballpark disclaimer. */
export function stripBallparkFromHtml(bodyHtml: string): string {
  if (!bodyHtml.includes(BALLPARK_DISCLAIMER)) return bodyHtml;
  return bodyHtml
    .replace(
      /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*indicative ballpark(?:(?!<\/p>)[\s\S])*<\/p>/gi,
      "",
    )
    .replace(/(\n\s*){3,}/g, "\n\n")
    .trim();
}

export function injectBallparkIntoHtml(
  bodyHtml: string,
  args: { minGbp: number; maxGbp: number; weeks: number },
): string {
  const paragraph = ballparkParagraphHtml(args);
  if (bodyHtml.includes(BALLPARK_DISCLAIMER)) return bodyHtml;
  const lastP = bodyHtml.lastIndexOf("<p");
  if (lastP > 0) {
    return `${bodyHtml.slice(0, lastP)}${paragraph}${bodyHtml.slice(lastP)}`;
  }
  return `${bodyHtml}${paragraph}`;
}

/** Strip any existing ballpark paragraph, then inject updated figures. */
export function replaceBallparkInHtml(
  bodyHtml: string,
  args: { minGbp: number; maxGbp: number; weeks: number },
): string {
  return injectBallparkIntoHtml(stripBallparkFromHtml(bodyHtml), args);
}

export function applyBallparkTokens(
  template: string,
  args: { minGbp: number; maxGbp: number; weeks: number },
): string {
  const range =
    args.minGbp === args.maxGbp
      ? `£${Math.round(args.minGbp).toLocaleString("en-GB")}`
      : `£${Math.round(args.minGbp).toLocaleString("en-GB")}–£${Math.round(args.maxGbp).toLocaleString("en-GB")}`;
  const weeksLabel =
    args.weeks === 1 ? "about 1 week" : `about ${args.weeks} weeks`;
  return template
    .replaceAll("{{ballpark_range}}", range)
    .replaceAll("{{ballpark_weeks}}", weeksLabel)
    .replaceAll("{{ballpark_disclaimer}}", BALLPARK_DISCLAIMER);
}
