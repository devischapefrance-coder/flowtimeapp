import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subscription } = await req.json();

    // Validate endpoint is an HTTPS URL
    if (!subscription?.endpoint || typeof subscription.endpoint !== "string") {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    try {
      const url = new URL(subscription.endpoint);
      if (url.protocol !== "https:") {
        return NextResponse.json({ error: "Endpoint must be HTTPS" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid endpoint URL" }, { status: 400 });
    }

    // Force user_id to authenticated user (ignore body userId)
    await supabaseAdmin.from("push_subscriptions").upsert(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    // Only delete subscriptions belonging to the authenticated user
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", user.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
