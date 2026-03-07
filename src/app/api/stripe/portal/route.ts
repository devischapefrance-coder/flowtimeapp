import { getAuthUser } from "@/lib/server-auth";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return Response.json({ error: "Aucun abonnement trouvé" }, { status: 400 });
    }

    const stripe = getStripe();
    const origin = req.headers.get("origin") || "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/abonnement`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    return Response.json({ error: "Erreur lors de l'accès au portail" }, { status: 500 });
  }
}
