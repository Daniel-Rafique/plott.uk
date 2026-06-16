import { Callout } from "./ui/callout";

export function DataDisclaimer() {
  return (
    <Callout
      variant="info"
      label="Public records only"
      title="Compliance note"
    >
      Data comes from the national Planning Data platform (alpha coverage;
      fields may be missing). This tool does not provide applicant contact
      details. Use each council&apos;s public register to verify facts before
      outreach. Direct marketing to individuals or businesses must comply with
      UK GDPR and PECR; obtain your own legal advice.
    </Callout>
  );
}
