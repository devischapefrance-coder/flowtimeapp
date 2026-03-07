import { getAuthUser } from "@/lib/server-auth";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PRICE_IDS } from "@/lib/subscription";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { priceKey } = await req.json();

    // Validate price key
    const priceId = PRICE_IDS[priceKey as keyof typeof PRICE_IDS];
    if (!priceId) {
      return Response.json({ error: "Prix invalide" }, { status: 400 });
    }

    const stripe = getStripe();

    // Get or create Stripe customer
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, email, first_name, last_name")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email,
        name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    // Create checkout session
    const origin = req.headers.get("origin") || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/abonnement?success=true`,
      cancel_url: `${origin}/abonnement?canceled=true`,
      metadata: { supabase_user_id: user.id },
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return Response.json({ error: "Erreur lors de la création du paiement" }, { status: 500 });
  }
}
