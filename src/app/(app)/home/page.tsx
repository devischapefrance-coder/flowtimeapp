"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import FlowChat from "@/components/FlowChat";
import Timeline from "@/components/Timeline";
import type { Event, Member } from "@/lib/types";

function getDays(count: number) {
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split("T")[0],
      label: i === 0 ? "Aujourd'hui" : i === 1 ? "Demain" : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
      dayName: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    });
  }
  return days;
}

export default function HomePage() {
  const { profile } = useProfile();
  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const days = getDays(7);
  const [selectedDay, setSelectedDay] = useState(0);
  const currentDate = days[selectedDay].date;

  const dateDisplay = days[selectedDay].dayName;

  const loadData = useCallback(async () => {
    if (!profile?.family_id) return;
    const [evRes, memRes] = await Promise.all([
      supabase
        .from("events")
        .select("*, members(name,emoji,color)")
        .eq("family_id", profile.family_id)
        .gte("date", days[0].date)
        .lte("date", days[days.length - 1].date),
      supabase.from("members").select("*").eq("family_id", profile.family_id),
    ]);
    if (evRes.data) setEvents(evRes.data as Event[]);
    if (memRes.data) setMembers(memRes.data as Member[]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.family_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const dayEvents = events.filter((e) => e.date === currentDate);
  const filteredEvents = filter
    ? dayEvents.filter((e) => e.member_id === filter)
    : dayEvents;

  // Count events per day for badges
  const eventCounts: Record<string, number> = {};
  for (const ev of events) {
    eventCounts[ev.date] = (eventCounts[ev.date] || 0) + 1;
  }

  async function deleteEvent(id: string) {
    await supabase.from("events").delete().eq("id", id);
    loadData();
  }

  async function handleFlowAction(action: { type: string; data: Record<string, unknown> }) {
    if (!profile?.family_id) return;

    if (action.type === "add_event") {
      const memberName = action.data.member_name as string;
      let memberId = null;
      if (memberName) {
        const mem = members.find((m) => m.name.toLowerCase() === memberName.toLowerCase());
        if (mem) memberId = mem.id;
      }
      await supabase.from("events").insert({
        family_id: profile.family_id,
        title: action.data.title,
        time: action.data.time,
        date: action.data.date || currentDate,
        member_id: memberId,
        description: action.data.description || "",
      });
    } else if (action.type === "delete_event") {
      await supabase.from("events").delete().eq("id", action.data.event_id);
    } else if (action.type === "add_recurring") {
      const memberName = action.data.member_name as string;
      let memberId = null;
      if (memberName) {
        const mem = members.find((m) => m.name.toLowerCase() === memberName.toLowerCase());
        if (mem) memberId = mem.id;
      }
      const recurringDays = action.data.days as number[];
      const startDate = new Date();
      for (let week = 0; week < 4; week++) {
        for (const day of recurringDays) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7) + week * 7);
          await supabase.from("events").insert({
            family_id: profile.family_id,
            title: action.data.title,
            time: action.data.time_start,
            date: d.toISOString().split("T")[0],
            member_id: memberId,
            recurring: { days: recurringDays, time_start: action.data.time_start, time_end: action.data.time_end },
          });
        }
      }
    }
    loadData();
  }

  const flowContext = {
    members: members.map((m) => ({ name: m.name, role: m.role, emoji: m.emoji })),
    events: dayEvents.map((e) => ({ id: e.id, title: e.title, time: e.time, member: e.members?.name })),
    today: currentDate,
  };

  return (
    <div className="px-4 py-4 animate-in">
      {/* Header */}
      <h1 className="text-xl font-extrabold">
        Bonjour {profile?.first_name} 👋
      </h1>
      <p className="text-sm capitalize mt-1" style={{ color: "var(--dim)" }}>
        {dateDisplay}
      </p>

      {/* Flow card */}
      <div className="card flex items-center gap-3 mt-5 cursor-pointer" onClick={() => setChatOpen(true)}>
        <div
          className="w-[50px] h-[50px] flex items-center justify-center rounded-full text-2xl animate-pulse"
          style={{ background: "linear-gradient(135deg, var(--accent), #FFA559)" }}
        >
          🌊
        </div>
        <div className="flex-1">
          <p className="text-[13px]">
            Hey, je suis <strong>Flow</strong>, votre assistant familial
          </p>
        </div>
      </div>

      {/* Day selector */}
      <div className="flex gap-2 mt-6 mb-2 overflow-x-auto pb-1">
        {days.map((d, i) => (
          <button
            key={d.date}
            className="flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl transition-colors relative"
            style={{
              background: selectedDay === i ? "var(--accent)" : "var(--surface2)",
              color: selectedDay === i ? "#fff" : "var(--dim)",
              minWidth: 72,
            }}
            onClick={() => setSelectedDay(i)}
          >
            <span className="text-[11px] font-bold capitalize">{d.label}</span>
            {eventCounts[d.date] > 0 && (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={{
                  background: selectedDay === i ? "#fff" : "var(--accent)",
                  color: selectedDay === i ? "var(--accent)" : "#fff",
                }}
              >
                {eventCounts[d.date]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Member filters */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        <button
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
          style={{
            background: !filter ? "var(--accent)" : "var(--surface2)",
            color: !filter ? "#fff" : "var(--dim)",
          }}
          onClick={() => setFilter(null)}
        >
          Tous
        </button>
        {members.map((m) => (
          <button
            key={m.id}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-colors"
            style={{
              background: filter === m.id ? "var(--accent)" : "var(--surface2)",
              color: filter === m.id ? "#fff" : "var(--dim)",
            }}
            onClick={() => setFilter(filter === m.id ? null : m.id)}
          >
            {m.emoji} {m.name}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <p className="label">
        {selectedDay === 0 ? "Planning du jour" : `Planning — ${days[selectedDay].label}`}
      </p>
      <Timeline events={filteredEvents} onDelete={deleteEvent} />

      {/* FAB */}
      <button
        className="fixed flex items-center justify-center rounded-full text-white text-[28px]"
        style={{
          bottom: 100,
          right: "max(20px, calc(50% - 195px))",
          width: 56,
          height: 56,
          background: "linear-gradient(135deg, var(--accent), #FFA559)",
          boxShadow: "0 4px 20px var(--accent-glow)",
          zIndex: 50,
        }}
        onClick={() => setChatOpen(true)}
      >
        +
      </button>

      {/* Chat */}
      <FlowChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        context={flowContext}
        onAction={handleFlowAction}
      />
    </div>
  );
}
