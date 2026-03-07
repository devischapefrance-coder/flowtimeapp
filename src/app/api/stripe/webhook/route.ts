import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { Plan } from "@/lib/subscription";

// Disable body parsing — Stripe needs raw body for signature verification
export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription" || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = priceIdToPlan(priceId);
        const userId = session.metadata?.supabase_user_id;

        if (userId) {
          await supabaseAdmin.from("profiles").update({
            subscription_plan: plan,
            subscription_status: "active",
            subscription_period_end: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
            stripe_customer_id: session.customer as string,
          }).eq("id", userId);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = priceIdToPlan(priceId);
        const status = subscription.status === "active" ? "active"
          : subscription.status === "past_due" ? "past_due"
          : subscription.cancel_at_period_end ? "canceled"
          : "active";

        await supabaseAdmin.from("profiles").update({
          subscription_plan: plan,
          subscription_status: status,
          subscription_period_end: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
        }).eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        await supabaseAdmin.from("profiles").update({
          subscription_plan: "free",
          subscription_status: "inactive",
          subscription_period_end: null,
        }).eq("stripe_customer_id", customerId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer as string;

        await supabaseAdmin.from("profiles").update({
          subscription_status: "past_due",
        }).eq("stripe_customer_id", customerId);
        break;
      }
    }

    return Response.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

function priceIdToPlan(priceId: string | undefined): Plan {
  if (!priceId) return "free";
  const plusPrices = [process.env.STRIPE_PRICE_PLUS_MONTHLY, process.env.STRIPE_PRICE_PLUS_ANNUAL];
  const proPrices = [process.env.STRIPE_PRICE_PRO_MONTHLY, process.env.STRIPE_PRICE_PRO_ANNUAL];
  if (proPrices.includes(priceId)) return "pro";
  if (plusPrices.includes(priceId)) return "plus";
  return "free";
}
