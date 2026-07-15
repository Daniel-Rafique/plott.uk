"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignUpForm } from "@/app/auth/sign-up/sign-up-form";
import { SignInForm } from "@/app/auth/sign-in/sign-in-form";
import { VerifyEmailFields } from "@/app/auth/verify-email/verify-email-form";
import {
  OnboardingWizard,
  type WizardInitial,
} from "@/app/onboarding/onboarding-wizard";
import { AuthTrustStrip } from "@/components/auth/auth-trust-strip";
import { freeTrialEyebrow } from "@/lib/trial";
import { sanitizeNext } from "@/lib/auth/sanitize-next";
import { cn } from "@/lib/utils";

export type FunnelStep = "sign-up" | "sign-in" | "verify" | "onboarding";

export type OpenFunnelOptions = {
  step?: FunnelStep;
  next?: string | null;
  email?: string | null;
};

type FunnelModalContextValue = {
  openFunnel: (options?: OpenFunnelOptions) => void;
  closeFunnel: () => void;
  /**
   * Route a signed-in user to the right funnel step (verify / onboarding modal)
   * or navigate to subscribe / dashboard — without bouncing through /app.
   */
  continueWorkspace: () => Promise<void>;
};

const FunnelModalContext = createContext<FunnelModalContextValue | null>(null);

export function useFunnelModal(): FunnelModalContextValue {
  const ctx = useContext(FunnelModalContext);
  if (!ctx) {
    throw new Error("useFunnelModal must be used within FunnelModalProvider");
  }
  return ctx;
}

/** Safe hook for optional usage (e.g. components that may render outside shell). */
export function useOptionalFunnelModal(): FunnelModalContextValue | null {
  return useContext(FunnelModalContext);
}

type SeedResponse = {
  stage?: string;
  email?: string | null;
  redirect?: string;
  initial?: WizardInitial;
  error?: string;
};

const EMPTY_WIZARD: WizardInitial = {
  name: "",
  websiteUrl: "",
  addressLines: "",
  phone: "",
  logoBlobUrl: null,
};

export function FunnelModalProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<FunnelStep>("sign-up");
  const [next, setNext] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  const [wizardInitial, setWizardInitial] =
    useState<WizardInitial>(EMPTY_WIZARD);
  const [loadingStage, setLoadingStage] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);

  const resetTransient = useCallback(() => {
    setJustCreated(false);
    setLoadingStage(false);
    setStageError(null);
    setWizardInitial(EMPTY_WIZARD);
  }, []);

  const openFunnel = useCallback((options?: OpenFunnelOptions) => {
    resetTransient();
    setStep(options?.step ?? "sign-up");
    setNext(sanitizeNext(options?.next) ?? null);
    setEmail(options?.email?.trim() || null);
    setOpen(true);
  }, [resetTransient]);

  const closeFunnel = useCallback(() => {
    setOpen(false);
    resetTransient();
  }, [resetTransient]);

  const navigateAndClose = useCallback(
    (path: string) => {
      closeFunnel();
      router.push(path);
      router.refresh();
    },
    [closeFunnel, router],
  );

  const applySeedResponse = useCallback(
    async (data: SeedResponse, resStatus: number) => {
      if (resStatus === 401 || data.stage === "unauthenticated") {
        setStep("sign-in");
        setOpen(true);
        return;
      }
      if (data.stage === "unverified") {
        if (data.email) setEmail(data.email);
        setJustCreated(false);
        setStep("verify");
        setOpen(true);
        return;
      }
      if (data.stage === "pending_invite" && data.redirect) {
        navigateAndClose(data.redirect);
        return;
      }
      if (
        (data.stage === "needs_plan" || data.stage === "ready") &&
        data.redirect
      ) {
        const dest = next?.startsWith("/subscribe") ? next : data.redirect;
        navigateAndClose(dest);
        return;
      }
      if (data.stage === "needs_company" && data.initial) {
        setWizardInitial(data.initial);
        setStep("onboarding");
        setOpen(true);
        return;
      }
      setStageError(data.error ?? "Could not continue setup. Try again.");
      setOpen(true);
    },
    [navigateAndClose, next],
  );

  const advanceAfterAuth = useCallback(async () => {
    setLoadingStage(true);
    setStageError(null);
    try {
      const res = await fetch("/api/company/onboarding-seed");
      const data = (await res.json().catch(() => ({}))) as SeedResponse;
      await applySeedResponse(data, res.status);
    } catch {
      setStageError("Could not continue setup. Try again.");
    } finally {
      setLoadingStage(false);
    }
  }, [applySeedResponse]);

  const continueWorkspace = useCallback(async () => {
    resetTransient();
    setLoadingStage(true);
    try {
      const res = await fetch("/api/company/onboarding-seed");
      const data = (await res.json().catch(() => ({}))) as SeedResponse;

      // Navigate-only stages: skip opening the modal.
      if (
        data.stage === "pending_invite" ||
        data.stage === "needs_plan" ||
        data.stage === "ready"
      ) {
        await applySeedResponse(data, res.status);
        return;
      }

      setOpen(true);
      await applySeedResponse(data, res.status);
    } catch {
      setOpen(true);
      setStageError("Could not continue setup. Try again.");
    } finally {
      setLoadingStage(false);
    }
  }, [applySeedResponse, resetTransient]);

  const value = useMemo(
    () => ({ openFunnel, closeFunnel, continueWorkspace }),
    [openFunnel, closeFunnel, continueWorkspace],
  );

  const isOnboarding = step === "onboarding";
  const showAuthChrome = step === "sign-up" || step === "sign-in";

  const title =
    step === "sign-up"
      ? "Create your account"
      : step === "sign-in"
        ? "Welcome back"
        : step === "verify"
          ? "Verify your email"
          : "Set up your workspace";

  const subtitle =
    step === "sign-up"
      ? "Map every application in your patch. Enrich applicants. Send branded letter and email outreach."
      : step === "sign-in"
        ? "Sign in to your account to continue."
        : step === "verify"
          ? "Enter the 6-digit code we sent you to continue."
          : "A few details so your outreach looks like you.";

  return (
    <FunnelModalContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeFunnel();
          else setOpen(true);
        }}
      >
        <DialogContent
          className={cn(
            "max-h-[90vh] overflow-y-auto sm:max-w-md",
            isOnboarding && "sm:max-w-lg",
          )}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className={showAuthChrome ? "pr-6" : "sr-only"}>
            {showAuthChrome && step === "sign-up" ? (
              <p className="editorial-chapter-label text-brand-dark">
                {freeTrialEyebrow().toUpperCase()}
              </p>
            ) : null}
            <DialogTitle
              className={
                showAuthChrome
                  ? "mt-2 font-[family-name:var(--font-display)] text-[clamp(26px,4vw,32px)] font-normal"
                  : undefined
              }
            >
              {title}
            </DialogTitle>
            <DialogDescription className={showAuthChrome ? "mt-2" : undefined}>
              {subtitle}
            </DialogDescription>
          </DialogHeader>

          {showAuthChrome ? (
            <div className="pb-2">
              <AuthTrustStrip />
            </div>
          ) : null}

          {loadingStage ? (
            <p className="py-8 text-center text-sm text-zinc-600">
              Continuing…
            </p>
          ) : null}

          {stageError ? (
            <p className="text-sm text-red-600" role="alert">
              {stageError}
            </p>
          ) : null}

          {!loadingStage && step === "sign-up" ? (
            <>
              <SignUpForm
                embedded
                next={next}
                defaultEmail={email}
                onSuccess={({ email: signedUpEmail }) => {
                  setEmail(signedUpEmail);
                  setJustCreated(true);
                  setStep("verify");
                }}
                onSwitchMode={() => setStep("sign-in")}
              />
              <p className="text-center text-sm text-zinc-500">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setStep("sign-in")}
                  className="font-medium text-zinc-900 underline underline-offset-2"
                >
                  Sign in
                </button>
              </p>
            </>
          ) : null}

          {!loadingStage && step === "sign-in" ? (
            <>
              <SignInForm
                embedded
                next={next}
                defaultEmail={email}
                onSuccess={() => {
                  void advanceAfterAuth();
                }}
                onNeedsVerify={({ email: unverified }) => {
                  setEmail(unverified);
                  setJustCreated(true);
                  setStep("verify");
                }}
              />
              <p className="text-center text-sm text-zinc-500">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => setStep("sign-up")}
                  className="font-medium text-zinc-900 underline underline-offset-2"
                >
                  Sign up free
                </button>
              </p>
            </>
          ) : null}

          {!loadingStage && step === "verify" ? (
            <VerifyEmailFields
              key={email ?? "verify"}
              embedded
              email={email}
              next={next}
              justCreated={justCreated}
              onSuccess={() => {
                void advanceAfterAuth();
              }}
            />
          ) : null}

          {!loadingStage && step === "onboarding" ? (
            <OnboardingWizard
              embedded
              compact
              initial={wizardInitial}
              next={next}
              onComplete={(path) => {
                navigateAndClose(path);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </FunnelModalContext.Provider>
  );
}
