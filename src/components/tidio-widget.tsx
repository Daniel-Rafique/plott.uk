"use client";

import Script from "next/script";

const TIDIO_SCRIPT_URL = "https://code.tidio.co/oinf6v5viat8nayh5kpsetzzw73zp0xh.js";

export function TidioWidget() {
  return (
    <Script
      id="tidio-widget"
      src={TIDIO_SCRIPT_URL}
      strategy="afterInteractive"
    />
  );
}
