/**
 * Shared helpers for generating a letter's PDF from the DB row and
 * (optionally) emailing it to configured recipients (personal opt-in +
 * workspace shared inbox). Entry points: letter status transitions,
 * approval materialisation.
 */

import type { Letter, Company, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { storeBlob } from "@/lib/blob";
import { renderLetterPdfBuffer } from "@/lib/letter-pdf";
import { sendLetterReadyEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { stripHtmlToText } from "@/lib/letter-renderer";

/**
 * Render a Letter row (plus its user) to a PDF buffer, using the same
 * layout as the single-PDF API route.
 */
export async function buildLetterPdfFromRow(args: {
  letter: Letter;
  company: Company;
}): Promise<Buffer> {
  const { letter, company } = args;
  const user = await prisma.user.findUnique({
    where: { id: letter.userId },
    select: { name: true, signatoryTitle: true, signatureBlobUrl: true },
  });

  return renderLetterPdfBuffer({
    company,
    signerName: user?.name ?? company.name,
    signerTitle: user?.signatoryTitle ?? "Director",
    signatureImageUrl: user?.signatureBlobUrl ?? null,
    addresseeName: letter.recipientName,
    addressLines: letter.addressLines,
    reference: letter.applicationRef,
    siteAddress: letter.siteAddress,
    description: null,
    planningUrl: null,
    bodyText: stripHtmlToText(letter.bodyHtml),
    footerText:
      company.letterFooter ??
      "This letter was generated for business outreach regarding public planning records. Direct marketing must comply with UK GDPR and PECR.",
  });
}

/**
 * Resolve the list of email addresses that should receive an auto-generated
 * PDF — the letter owner's inbox when `emailPdfOnPrint` is enabled, plus
 * `pdfEmailRecipients` when the company turns on workspace shared delivery.
 */
export function resolvePdfEmailRecipients(args: {
  user: Pick<User, "email" | "emailPdfOnPrint">;
  company: Pick<Company, "autoEmailPdf" | "pdfEmailRecipients">;
}): string[] {
  const recipients = new Set<string>();
  // The signing user gets a copy if they opted in on their profile.
  if (args.user.emailPdfOnPrint && args.user.email) {
    recipients.add(args.user.email);
  }
  // Company-wide extras always get a copy when the company toggle is on.
  if (args.company.autoEmailPdf) {
    for (const extra of args.company.pdfEmailRecipients ?? []) {
      const trimmed = extra.trim();
      if (trimmed) recipients.add(trimmed);
    }
  }
  return Array.from(recipients);
}

/**
 * Store the PDF to blob storage and persist the URL on the Letter row.
 * Safe to call multiple times — each call replaces the previous URL.
 */
export async function persistLetterPdf(args: {
  letter: Letter;
  company: Pick<Company, "id">;
  pdf: Buffer;
}): Promise<{ url: string; pathname: string }> {
  const blob = await storeBlob({
    companyId: args.company.id,
    kind: "letter",
    filename: `letter-${args.letter.id}.pdf`,
    contentType: "application/pdf",
    data: args.pdf,
  });
  await prisma.letter.update({
    where: { id: args.letter.id },
    data: { pdfBlobUrl: blob.url, pdfBlobPathname: blob.pathname },
  });
  return { url: blob.url, pathname: blob.pathname };
}

/**
 * Generate (or re-use) a letter PDF and email it to the configured
 * recipients. Skips when `pdfAttachedEmailSentAt` is already set (dedupes
 * approve / printed / sent). After at least one successful send, sets that
 * timestamp. Swallows render/blob errors appropriately — callers are never
 * blocked beyond this function's own thrown edge cases (none today).
 *
 * Returns the number of recipients that were emailed (0 when disabled,
 * nobody configured, already delivered, or total failure).
 */
export async function deliverLetterPdfByEmail(args: {
  letter: Letter;
  company: Company;
  user: Pick<User, "email" | "emailPdfOnPrint">;
  /** Set `true` for the historical "marked printed" / print-queue wording. */
  autoPrint?: boolean;
}): Promise<number> {
  const fresh = await prisma.letter.findUnique({
    where: { id: args.letter.id },
  });
  if (!fresh || fresh.pdfAttachedEmailSentAt != null) {
    return 0;
  }

  const recipients = resolvePdfEmailRecipients({
    user: args.user,
    company: args.company,
  });
  if (recipients.length === 0) return 0;

  let pdf: Buffer;
  try {
    pdf = await buildLetterPdfFromRow({
      letter: fresh,
      company: args.company,
    });
  } catch (err) {
    logger.warn(
      { err, letterId: fresh.id },
      "letter-delivery: pdf render failed; skipping email",
    );
    return 0;
  }

  try {
    await persistLetterPdf({
      letter: fresh,
      company: args.company,
      pdf,
    });
  } catch (err) {
    logger.warn(
      { err, letterId: fresh.id },
      "letter-delivery: pdf blob store failed; continuing with email",
    );
  }

  let sent = 0;
  for (const to of recipients) {
    try {
      await sendLetterReadyEmail({
        to,
        letterId: fresh.id,
        recipientName: fresh.recipientName,
        reference: fresh.applicationRef,
        siteAddress: fresh.siteAddress,
        pdfBuffer: pdf,
        companyName: args.company.name,
        autoPrint: args.autoPrint,
      });
      sent += 1;
    } catch (err) {
      logger.warn(
        { err, letterId: fresh.id, to },
        "letter-delivery: email send failed",
      );
    }
  }

  if (sent > 0) {
    await prisma.letter.update({
      where: { id: fresh.id },
      data: { pdfAttachedEmailSentAt: new Date() },
    });
  }

  return sent;
}

/**
 * Runs PDF inbox delivery asynchronously (best-effort, never throws to caller).
 * Loads the letter owner and full company row (workspace shared-recipient fields included).
 */
export function scheduleLetterPdfEmailDelivery(args: {
  letterId: string;
  autoPrint: boolean;
}): void {
  void (async () => {
    try {
      const letter = await prisma.letter.findUnique({
        where: { id: args.letterId },
      });
      if (!letter) return;
      const [signer, company] = await Promise.all([
        prisma.user.findUnique({
          where: { id: letter.userId },
          select: { email: true, emailPdfOnPrint: true },
        }),
        prisma.company.findUnique({
          where: { id: letter.companyId },
        }),
      ]);
      if (!signer || !company) return;
      await deliverLetterPdfByEmail({
        letter,
        company,
        user: signer,
        autoPrint: args.autoPrint,
      });
    } catch (err) {
      logger.warn(
        { err, letterId: args.letterId },
        "scheduleLetterPdfEmailDelivery failed",
      );
    }
  })();
}
