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

export const onboardingCompanySchema = z.object({
  name: z.string().trim().min(2, "Company name must be at least 2 characters"),
  websiteUrl: z.string().trim(),
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
