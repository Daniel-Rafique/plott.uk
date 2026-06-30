"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { cn } from "@/lib/utils";

type KlaviyoBrowserApi = {
  identify?: (properties: Record<string, unknown>) => Promise<unknown> | unknown;
  track?: (event: string, properties?: Record<string, unknown>) => Promise<unknown> | unknown;
};

type EmailCaptureProps = {
  source: string;
  leadMagnet: string;
  title: string;
  description: string;
  className?: string;
  onSuccess?: () => void;
};

const CONSENT_COPY =
  "I agree to receive Plott planning lead resources, product updates and marketing emails. I can unsubscribe at any time.";

const SUBSCRIBED_KEY = "plott_marketing_capture_subscribed_at";

function storeNow(key: string) {
  window.localStorage.setItem(key, String(Date.now()));
}

function collectUtm() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const utm = {
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    term: params.get("utm_term"),
    content: params.get("utm_content"),
  };
  const hasValues = Object.values(utm).some(Boolean);
  if (hasValues) {
    window.sessionStorage.setItem("plott_utm", JSON.stringify(utm));
    return utm;
  }

  const stored = window.sessionStorage.getItem("plott_utm");
  if (!stored) return null;
  try {
    return JSON.parse(stored) as typeof utm;
  } catch {
    return null;
  }
}

function identifyLeadInKlaviyo(args: {
  email: string;
  name?: string;
  company?: string;
  source: string;
  leadMagnet: string;
  path: string | null;
}) {
  if (typeof window === "undefined") return;
  const klaviyo = (window as Window & { klaviyo?: KlaviyoBrowserApi }).klaviyo;
  if (!klaviyo) return;

  const [firstName, ...lastNameParts] = (args.name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const identity = {
    email: args.email,
    first_name: firstName || undefined,
    last_name: lastNameParts.length > 0 ? lastNameParts.join(" ") : undefined,
    company: args.company || undefined,
    lead_source: args.source,
    lead_magnet: args.leadMagnet,
  };

  void Promise.resolve(klaviyo.identify?.(identity))
    .then(() =>
      klaviyo.track?.("Marketing Lead Submitted", {
        source: args.source,
        lead_magnet: args.leadMagnet,
        variant: "inline",
        path: args.path,
      }),
    )
    .catch(() => {});
}

export function EmailCapture({
  source,
  leadMagnet,
  title,
  description,
  className,
  onSuccess,
}: EmailCaptureProps) {
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    posthog.capture("marketing_capture_impression", {
      source,
      lead_magnet: leadMagnet,
      variant: "inline",
      path: pathname,
    });
  }, [leadMagnet, pathname, source]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const response = await fetch("/api/marketing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name || null,
          company: company || null,
          source,
          path: pathname,
          leadMagnet,
          consentAccepted,
          website,
          utm: collectUtm(),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Could not subscribe right now.");
      }

      setStatus("success");
      storeNow(SUBSCRIBED_KEY);
      posthog.capture("marketing_capture_submitted", {
        source,
        lead_magnet: leadMagnet,
        variant: "inline",
        path: pathname,
      });
      identifyLeadInKlaviyo({
        email,
        name,
        company,
        source,
        leadMagnet,
        path: pathname,
      });
      onSuccess?.();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not subscribe right now.");
    }
  }

  if (status === "success") {
    return (
      <div
        className={cn(
          "rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 md:p-8",
          className,
        )}
      >
        <p className="editorial-chapter-label text-emerald-700">Check your inbox</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-[28px] font-normal leading-tight tracking-tight text-zinc-950">
          Your resource is on its way.
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-zinc-700">
          Thanks. We sent {leadMagnet.toLowerCase()} to{" "}
          <span className="font-semibold text-zinc-950">{email}</span>. You can
          also expect occasional practical Plott updates.
        </p>
        <p className="mt-4 text-[12px] leading-relaxed text-zinc-500">
          If it does not arrive in a minute or two, check spam or promotions.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:p-8",
        className,
      )}
    >
      <p className="editorial-chapter-label text-brand-dark">Free resource</p>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-[28px] font-normal leading-tight tracking-tight text-zinc-950">
        {title}
      </h2>
      <p className="mt-4 text-[14px] leading-relaxed text-zinc-600">{description}</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          aria-hidden="true"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            className="rounded-2xl border border-zinc-200 px-4 py-3 text-[14px] outline-none transition focus:border-brand"
          />
          <input
            type="text"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="Company"
            className="rounded-2xl border border-zinc-200 px-4 py-3 text-[14px] outline-none transition focus:border-brand"
          />
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Work email"
          className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-[14px] outline-none transition focus:border-brand"
        />
        <label className="flex items-start gap-3 text-[12px] leading-relaxed text-zinc-600">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(event) => setConsentAccepted(event.target.checked)}
            required
            className="mt-1 h-4 w-4 rounded border-zinc-300 text-brand"
          />
          <span>
            {CONSENT_COPY} Read our{" "}
            <a href="/privacy" className="underline underline-offset-4">
              privacy notice
            </a>
            .
          </span>
        </label>
        {error ? <p className="text-[13px] text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-full bg-zinc-950 px-6 py-3 text-[13px] font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting" ? "Subscribing..." : "Send me the resource"}
        </button>
      </form>
    </div>
  );
}
