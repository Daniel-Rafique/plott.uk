import { getStripe } from "@/lib/stripe";
import { applySubscriptionFromCompletedCheckout } from "@/lib/stripe/subscription-state";

export class CheckoutSyncError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CheckoutSyncError";
    this.status = status;
  }
}

export async function syncCheckoutSessionForCompany({
  sessionId,
  companyId,
}: {
  sessionId: string;
  companyId: string;
}): Promise<{ priceId: string | null }> {
  if (!sessionId.trim().startsWith("cs_")) {
    throw new CheckoutSyncError("sessionId (cs_...) is required", 400);
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "subscription"],
  });

  if (session.status !== "complete") {
    throw new CheckoutSyncError("Checkout is not complete yet", 400);
  }

  const sessionCompanyId =
    session.metadata?.companyId ?? session.client_reference_id ?? null;
  if (sessionCompanyId !== companyId) {
    throw new CheckoutSyncError(
      "This checkout session is not for your company",
      403,
    );
  }

  await applySubscriptionFromCompletedCheckout(session);

  const subscription =
    session.subscription && typeof session.subscription === "object"
      ? session.subscription
      : null;
  const price = subscription?.items.data[0]?.price;
  return { priceId: typeof price === "string" ? price : (price?.id ?? null) };
}
