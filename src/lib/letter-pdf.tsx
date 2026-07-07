import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Company } from "@prisma/client";
import { fetchBlobAsDataUri } from "@/lib/blob";

// Register Geist (brand font) for PDF rendering. Files are vendored into
// public/fonts at build time so they're present in any Vercel/Node deployment
// without fiddling with outputFileTracingIncludes. @react-pdf reads local
// paths server-side via fs.
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  try {
    Font.register({
      family: "Geist",
      fonts: [
        { src: path.join(FONT_DIR, "Geist-Regular.ttf"), fontWeight: 400 },
        { src: path.join(FONT_DIR, "Geist-Medium.ttf"), fontWeight: 500 },
        { src: path.join(FONT_DIR, "Geist-SemiBold.ttf"), fontWeight: 600 },
        { src: path.join(FONT_DIR, "Geist-Bold.ttf"), fontWeight: 700 },
      ],
    });
    // Treat newlines as word-break opportunities (matches HTML wrapping).
    Font.registerHyphenationCallback((word) => [word]);
    fontsRegistered = true;
  } catch {
    // Fall back to built-in Helvetica if the font files are missing.
    fontsRegistered = true;
  }
}

export type PdfLetterInput = {
  company: Company;
  signerName: string;
  signerTitle: string;
  signatureImageUrl?: string | null;
  addresseeName: string;
  addressLines: string;
  reference?: string | null;
  siteAddress?: string | null;
  description?: string | null;
  planningUrl?: string | null;
  /** Plain-text body. Merge fields should already be resolved. */
  bodyText: string;
  footerText?: string | null;
  date?: Date;
};

const styles = StyleSheet.create({
  page: {
    padding: 56,
    fontSize: 11,
    fontFamily: "Geist",
    fontWeight: 400,
    color: "#18181b",
    lineHeight: 1.55,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  logo: { maxHeight: 70, maxWidth: 180, objectFit: "contain" },
  headerRight: { textAlign: "right", fontSize: 9, color: "#52525b", lineHeight: 1.45 },
  body: { marginTop: 16 },
  paragraph: { marginBottom: 10 },
  reBlock: { marginBottom: 10 },
  reLine: { fontWeight: 600 },
  siteAddress: { fontSize: 10, color: "#52525b", fontWeight: 400, marginTop: 2 },
  sig: { marginTop: 24 },
  sigImage: { maxHeight: 48, maxWidth: 200, marginBottom: 4, objectFit: "contain" },
  sigName: { fontWeight: 600 },
  sigTitle: { fontSize: 9, color: "#52525b" },
  footer: {
    marginTop: 36,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
    fontSize: 8,
    color: "#71717a",
  },
});

function formatDate(d = new Date()): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

type ResolvedInput = PdfLetterInput & {
  logoDataUri: string | null;
  signatureDataUri: string | null;
};

function renderHeader(company: Company, logoDataUri: string | null) {
  const lines = [
    company.name,
    company.addressLines,
    [company.phone, company.email].filter(Boolean).join(" · "),
    company.websiteUrl,
  ]
    .filter((s): s is string => Boolean(s?.trim()))
    .join("\n");

  return (
    <View style={styles.header}>
      {logoDataUri ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- React PDF Image does not support DOM alt text.
        <Image src={logoDataUri} style={styles.logo} />
      ) : (
        <Text style={{ fontSize: 16, fontWeight: 600 }}>{company.name}</Text>
      )}
      <Text style={styles.headerRight}>{lines}</Text>
    </View>
  );
}

function LetterDocument({ i }: { i: ResolvedInput }) {
  const date = formatDate(i.date);
  const paragraphs = splitParagraphs(i.bodyText);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {renderHeader(i.company, i.logoDataUri)}
        <View style={styles.body}>
          <Text style={styles.paragraph}>{date}</Text>
          <Text style={styles.paragraph}>
            {i.addresseeName}
            {"\n"}
            {i.addressLines}
          </Text>
          {i.reference ? (
            <View style={styles.reBlock}>
              <Text style={styles.reLine}>Re: {i.reference}</Text>
              {i.siteAddress ? (
                <Text style={styles.siteAddress}>{i.siteAddress}</Text>
              ) : null}
            </View>
          ) : null}
          {paragraphs.map((p, idx) => (
            <Text key={idx} style={styles.paragraph}>
              {p}
            </Text>
          ))}
        </View>

        <View style={styles.sig}>
          {i.signatureDataUri ? (
            // eslint-disable-next-line jsx-a11y/alt-text -- React PDF Image does not support DOM alt text.
            <Image src={i.signatureDataUri} style={styles.sigImage} />
          ) : null}
          <Text style={styles.sigName}>{i.signerName}</Text>
          <Text style={styles.sigTitle}>
            {i.signerTitle}, {i.company.name}
          </Text>
        </View>

        {(i.footerText ?? "").trim().length > 0 && (
          <Text style={styles.footer}>{i.footerText}</Text>
        )}
      </Page>
    </Document>
  );
}

export async function renderLetterPdfBuffer(
  input: PdfLetterInput,
): Promise<Buffer> {
  registerFonts();
  // Private Vercel Blob: @react-pdf can't fetch authed URLs, so we resolve
  // logo + signature bytes server-side into base64 data URIs before rendering.
  const [logoDataUri, signatureDataUri] = await Promise.all([
    input.company.logoBlobUrl
      ? fetchBlobAsDataUri(input.company.logoBlobUrl)
      : Promise.resolve(null),
    input.signatureImageUrl
      ? fetchBlobAsDataUri(input.signatureImageUrl)
      : Promise.resolve(null),
  ]);

  const resolved: ResolvedInput = {
    ...input,
    logoDataUri,
    signatureDataUri,
  };

  return renderToBuffer(<LetterDocument i={resolved} />);
}
