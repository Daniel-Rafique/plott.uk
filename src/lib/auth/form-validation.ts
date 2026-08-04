import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email")
  .email("Enter a valid email address");

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  email: emailSchema,
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

/**
 * Accept empty, full URLs, or bare domains like `acme.co.uk`.
 * Bare domains are normalised to `https://…` so Zod `.url()` and letter footers work.
 */
export function normalizeWebsiteUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    // Throws on clearly unusable values (spaces in host, etc.).
    const url = new URL(withProtocol);
    if (!url.hostname) return undefined;
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export const optionalWebsiteUrlSchema = z.preprocess((val) => {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return normalizeWebsiteUrl(trimmed) ?? trimmed;
}, z.string().url("Enter a valid website URL (e.g. acme.co.uk)").max(200).optional());

export const optionalTrimmedString = (max: number) =>
  z.preprocess((val) => {
    if (typeof val !== "string") return val;
    const trimmed = val.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().max(max).optional());

export const onboardingCompanySchema = z.object({
  name: z.string().trim().min(2, "Company name must be at least 2 characters"),
  websiteUrl: optionalWebsiteUrlSchema,
});

export type FieldErrors<T extends string> = Partial<Record<T, string>>;

export function fieldErrorsFromZod<T extends string>(
  error: z.ZodError,
): FieldErrors<T> {
  const out: FieldErrors<T> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in out)) {
      out[key as T] = issue.message;
    }
  }
  return out;
}

export function inputErrorClass(hasError: boolean): string {
  return hasError
    ? "border-red-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-400"
    : "border-zinc-300";
}
