import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { catEmoji, getWebPush } from "@/lib/push-utils";

export async function GET(req: NextRequest) {
  // Protect with CRON_SECRET
  // CRON_SECRET must be defined — refuse if missing
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const push = getWebPush();
    // Use Paris timezone (server may be UTC)
    const now = new Date();
    const parisNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    const today = `${parisNow.getFullYear()}-${String(parisNow.getMonth() + 1).padStart(2, "0")}-${String(parisNow.getDate()).padStart(2, "0")}`;

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
        .select("id, title, time, category, member_id, members(name)")
        .eq("family_id", familyId)
        .eq("date", today)
        .order("time");

      const eventList = events || [];
      const greetings = ["Prete pour cette journee", "C'est parti", "Voici ton programme", "Belle journee en vue"];
      const emptyDay = ["Journee libre ! Profite bien", "Rien de prevu, a toi de jouer", "Journee tranquille aujourd'hui"];

      // Send to each member of this family
      for (const member of familyMembers) {
        const memberSubs = subs.filter((s: { user_id: string }) => s.user_id === member.userId);

        let title: string;
        let body: string;

        if (eventList.length === 0) {
          title = `Bonjour ${member.name} ☀️`;
          body = emptyDay[Math.floor(Math.random() * emptyDay.length)] + " 😌";
        } else {
          const greeting = greetings[Math.floor(Math.random() * greetings.length)];
          title = `Bonjour ${member.name} ! ${eventList.length} evenement${eventList.length > 1 ? "s" : ""} aujourd'hui`;
          const lines = eventList
            .slice(0, 4)
            .map((e: Record<string, unknown>) => {
              const memberName = (e.members as { name: string } | null)?.name;
              const cat = (e.category as string) || "general";
              const emoji = catEmoji(cat);
              return `${emoji} ${e.time} ${e.title}${memberName ? ` · ${memberName}` : ""}`;
            })
            .join("\n");
          const more = eventList.length > 4 ? `\n   +${eventList.length - 4} autre(s)...` : "";
          body = `${greeting} !\n${lines}${more}`;
        }

        // Build scheduled reminders (15 min before each event)
        const reminders = eventList
          .map((e: Record<string, unknown>) => {
            const [h, m] = (e.time as string).split(":").map(Number);
            // Calculate Paris-local event time in UTC millis
            const parisMidnight = new Date(parisNow);
            parisMidnight.setHours(0, 0, 0, 0);
            const offsetMs = now.getTime() - parisNow.getTime(); // UTC - Paris offset
            const eventDate = new Date(parisMidnight.getTime() + h * 3600000 + m * 60000 + offsetMs);
            const reminderTime = eventDate.getTime() - 15 * 60 * 1000;
            const memberName = (e.members as { name: string } | null)?.name;
            const cat = (e.category as string) || "general";
            const emoji = catEmoji(cat);
            return {
              timestamp: reminderTime,
              title: `${emoji} ${e.title} a ${e.time}`,
              body: memberName
                ? `C'est bientot l'heure ! ${memberName}, RDV a ${e.time}`
                : `C'est bientot l'heure ! RDV a ${e.time}`,
              tag: `flowtime-reminder-${e.id}`,
            };
          })
          .filter((r) => r.timestamp > Date.now());

        const payload = JSON.stringify({
          title,
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: "flowtime-morning",
          url: "/home",
          actions: eventList.length > 0 ? [{ action: "view", title: "Voir le planning" }] : [],
          reminders,
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
