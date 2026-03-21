import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getWebPush } from "@/lib/push-utils";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const push = getWebPush();
    const { title, body, userId, familyId, url, tag } = await req.json();
    if (!title) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    // Get the caller's profile to verify family membership
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("family_id")
      .eq("id", user.id)
      .single();

    if (!callerProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    if (familyId && callerProfile.family_id !== familyId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // If targeting a specific user, verify they're in the same family
    if (userId) {
      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("family_id")
        .eq("id", userId)
        .single();

      if (!targetProfile || targetProfile.family_id !== callerProfile.family_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    let query = supabaseAdmin.from("push_subscriptions").select("*");
    if (userId) {
      query = query.eq("user_id", userId);
    } else {
      // Send to all family members except the caller
      const targetFamilyId = familyId || callerProfile.family_id;
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("family_id", targetFamilyId);
      if (profiles && profiles.length > 0) {
        const ids = profiles.map((p: { id: string }) => p.id).filter((id: string) => id !== user.id);
        if (ids.length === 0) return NextResponse.json({ sent: 0 });
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
      url: url || "/home",
      tag: tag || "flowtime",
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
