import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails("mailto:flowtime@example.com", publicKey, privateKey);
  return webpush;
}

export async function GET(req: NextRequest) {
  // Protect with CRON_SECRET
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const push = getWebPush();
    const today = new Date().toISOString().split("T")[0];

    // Get all families with push subscriptions
    const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("user_id, endpoint, keys");
    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, families: 0 });
    }

    // Get profiles for these users
    const userIds = [...new Set(subs.map((s: { user_id: string }) => s.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, family_id")
      .in("id", userIds);

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ sent: 0, families: 0 });
    }

    // Group by family
    const families = new Map<string, { name: string; userId: string }[]>();
    for (const p of profiles) {
      if (!families.has(p.family_id)) families.set(p.family_id, []);
      families.get(p.family_id)!.push({ name: p.first_name, userId: p.id });
    }

    let totalSent = 0;

    for (const [familyId, familyMembers] of families) {
      // Get today's events for this family
      const { data: events } = await supabaseAdmin
        .from("events")
        .select("title, time, member_id, members(name)")
        .eq("family_id", familyId)
        .eq("date", today)
        .order("time");

      const eventList = events || [];
      let body: string;
      if (eventList.length === 0) {
        body = "Aucun evenement prevu aujourd'hui. Bonne journee !";
      } else {
        const summary = eventList
          .slice(0, 4)
          .map((e: Record<string, unknown>) => {
            const memberName = (e.members as { name: string } | null)?.name;
            return `${e.time} ${e.title}${memberName ? ` (${memberName})` : ""}`;
          })
          .join(", ");
        const more = eventList.length > 4 ? ` +${eventList.length - 4} autre(s)` : "";
        body = `${eventList.length} evenement(s) : ${summary}${more}`;
      }

      // Send to each member of this family
      for (const member of familyMembers) {
        const memberSubs = subs.filter((s: { user_id: string }) => s.user_id === member.userId);
        const payload = JSON.stringify({
          title: `Bonjour ${member.name} !`,
          body,
          icon: "/icons/icon-192.png",
        });

        for (const sub of memberSubs) {
          try {
            await push.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
            totalSent++;
          } catch {
            await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }
    }

    return NextResponse.json({ sent: totalSent, families: families.size });
  } catch (err) {
    console.error("Morning cron error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
