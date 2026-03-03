import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

webpush.setVapidDetails(
  "mailto:flowtime@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { title, body, userId, familyId } = await req.json();
    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    let query = supabaseAdmin.from("push_subscriptions").select("*");
    if (userId) {
      query = query.eq("user_id", userId);
    } else if (familyId) {
      // Get all user IDs in this family, then their subscriptions
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("family_id", familyId);
      if (profiles && profiles.length > 0) {
        const ids = profiles.map((p: { id: string }) => p.id);
        query = query.in("user_id", ids);
      }
    }

    const { data: subs } = await query;
    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const payload = JSON.stringify({
      title,
      body: body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        sent++;
      } catch {
        // Remove invalid subscriptions
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }

    return NextResponse.json({ sent });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
