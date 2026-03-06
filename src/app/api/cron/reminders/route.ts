import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { catEmoji, getWebPush } from "@/lib/push-utils";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const push = getWebPush();
    const now = new Date();
    // Use Paris timezone (server may be UTC)
    const parisNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    const today = `${parisNow.getFullYear()}-${String(parisNow.getMonth() + 1).padStart(2, "0")}-${String(parisNow.getDate()).padStart(2, "0")}`;

    // Current time + 15 min window
    const currentMinutes = parisNow.getHours() * 60 + parisNow.getMinutes();
    const reminderStart = currentMinutes + 10; // events in 10-20 min
    const reminderEnd = currentMinutes + 20;

    // Get today's events
    const { data: events } = await supabaseAdmin
      .from("events")
      .select("id, title, time, family_id, member_id, category, members(name)")
      .eq("date", today);

    if (!events || events.length === 0) {
      return NextResponse.json({ sent: 0, checked: 0 });
    }

    // Filter events happening in 10-20 minutes
    const upcoming = events.filter((e) => {
      const [h, m] = e.time.split(":").map(Number);
      const eventMinutes = h * 60 + m;
      return eventMinutes >= reminderStart && eventMinutes < reminderEnd;
    });

    if (upcoming.length === 0) {
      return NextResponse.json({ sent: 0, checked: events.length });
    }

    // Get push subscriptions grouped by family
    const familyIds = [...new Set(upcoming.map((e) => e.family_id))];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, family_id")
      .in("family_id", familyIds);

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ sent: 0, checked: events.length });
    }

    const userIds = profiles.map((p) => p.id);
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions")
      .select("user_id, endpoint, keys")
      .in("user_id", userIds);

    if (!subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, checked: events.length });
    }

    let totalSent = 0;

    for (const event of upcoming) {
      const memberName = (event.members as { name: string }[] | { name: string } | null);
      const mName = Array.isArray(memberName) ? memberName[0]?.name : memberName?.name;
      const familyProfiles = profiles.filter((p) => p.family_id === event.family_id);
      const familyUserIds = familyProfiles.map((p) => p.id);
      const familySubs = subs.filter((s) => familyUserIds.includes(s.user_id));

      const cat = (event.category as string) || "general";
      const emoji = catEmoji(cat);

      const payload = JSON.stringify({
        title: `${emoji} ${event.title} a ${event.time}`,
        body: mName
          ? `C'est bientot l'heure ! ${mName}, c'est dans 15 min`
          : "C'est bientot l'heure ! Dans 15 minutes",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: `flowtime-reminder-${event.id}`,
        url: "/home",
        actions: [{ action: "view", title: "Voir le planning" }],
      });

      for (const sub of familySubs) {
        try {
          await push.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
          totalSent++;
        } catch {
          await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }

    return NextResponse.json({ sent: totalSent, reminders: upcoming.length, checked: events.length });
  } catch (err) {
    console.error("Reminders cron error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
