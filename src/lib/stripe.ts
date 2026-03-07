import Stripe from "stripe";

// Lazy init Stripe server client (same pattern as supabase-admin.ts)
let _client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_client) {
    _client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _client;
}
