import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getAuthUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

function getWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured");
  }
  webpush.setVapidDetails("mailto:flowtime@example.com", publicKey, privateKey);
  return webpush;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const push = getWebPush();
    const { title, body, userId, familyId } = await req.json();
    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    // Verify the authenticated user belongs to the target family
    if (familyId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("family_id")
        .eq("id", user.id)
        .single();

      if (!profile || profile.family_id !== familyId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    let query = supabaseAdmin.from("push_subscriptions").select("*");
    if (userId) {
      query = query.eq("user_id", userId);
    } else if (familyId) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("family_id", familyId);
      if (profiles && profiles.length > 0) {
        const ids = profiles.map((p: { id: string }) => p.id);
        query = query.in("user_id", ids);
      }
    }

    const { data: subs, error: queryError } = await query;
    if (queryError) {
      console.error("Push send query error:", queryError.message, queryError.code);
      return NextResponse.json({ error: "DB query error: " + queryError.message, sent: 0 });
    }
    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, debug: "No subscriptions found for query" });
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
        await push.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        sent++;
      } catch {
        await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }

    return NextResponse.json({ sent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Push send error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
