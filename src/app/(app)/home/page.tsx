"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import FlowChat from "@/components/FlowChat";
import Timeline from "@/components/Timeline";
import NotificationManager from "@/components/NotificationManager";
import type { Event, Member, Address, Contact } from "@/lib/types";

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

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon apres-midi";
  return "Bonsoir";
}

export default function HomePage() {
  const { profile } = useProfile();
  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [wellbeingStreak, setWellbeingStreak] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const days = getDays(7);
  const [selectedDay, setSelectedDay] = useState(0);
  const currentDate = days[selectedDay].date;

  const dateDisplay = days[selectedDay].dayName;

  const loadData = useCallback(async () => {
    if (!profile?.family_id) return;
    const [evRes, memRes, addrRes, contRes, wbRes] = await Promise.all([
      supabase
        .from("events")
        .select("*, members(name,emoji,color)")
        .eq("family_id", profile.family_id)
        .gte("date", days[0].date)
        .lte("date", days[days.length - 1].date),
      supabase.from("members").select("*").eq("family_id", profile.family_id),
      supabase.from("addresses").select("*").eq("family_id", profile.family_id),
      supabase.from("contacts").select("*").eq("family_id", profile.family_id),
      supabase.from("wellbeing_sessions").select("date").eq("user_id", profile.id).order("date", { ascending: false }).limit(30),
    ]);
    if (evRes.data) setEvents(evRes.data as Event[]);
    if (memRes.data) setMembers(memRes.data as Member[]);
    if (addrRes.data) setAddresses(addrRes.data as Address[]);
    if (contRes.data) setContacts(contRes.data as Contact[]);
    if (wbRes.data) {
      const dates = [...new Set(wbRes.data.map((d: { date: string }) => d.date))];
      let streak = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let i = 0; i < dates.length; i++) {
        const d = new Date(dates[i] as string);
        d.setHours(0, 0, 0, 0);
        const expected = new Date(today);
        expected.setDate(expected.getDate() - i);
        if (d.getTime() === expected.getTime()) streak++;
        else break;
      }
      setWellbeingStreak(streak);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.family_id]);

  useEffect(() => { loadData(); }, [loadData]);

  const dayEvents = events.filter((e) => e.date === currentDate);
  const filteredEvents = filter
    ? dayEvents.filter((e) => e.member_id === filter)
    : dayEvents;

  const eventCounts: Record<string, number> = {};
  for (const ev of events) {
    eventCounts[ev.date] = (eventCounts[ev.date] || 0) + 1;
  }

  // Next upcoming event
  const now = new Date();
  const nextEvent = dayEvents
    .filter((e) => {
      if (!e.time) return false;
      const [h, m] = e.time.split(":").map(Number);
      return h * 60 + m > now.getHours() * 60 + now.getMinutes();
    })
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""))[0];

  async function deleteEvent(id: string) {
    await supabase.from("events").delete().eq("id", id);
    loadData();
  }

  function resolveMemberId(memberName?: string): string | null {
    if (!memberName) return null;
    const mem = members.find((m) => m.name.toLowerCase() === memberName.toLowerCase());
    return mem?.id || null;
  }

  async function handleFlowAction(action: { type: string; data: Record<string, unknown> }) {
    if (!profile?.family_id) return;

    if (action.type === "add_event") {
      await supabase.from("events").insert({
        family_id: profile.family_id,
        title: action.data.title,
        time: action.data.time,
        date: action.data.date || currentDate,
        member_id: resolveMemberId(action.data.member_name as string),
        description: action.data.description || "",
      });
    } else if (action.type === "delete_event") {
      await supabase.from("events").delete().eq("id", action.data.event_id);
    } else if (action.type === "edit_event") {
      await supabase.from("events").delete().eq("id", action.data.event_id);
      await supabase.from("events").insert({
        family_id: profile.family_id,
        title: action.data.title,
        time: action.data.time,
        date: action.data.date || currentDate,
        member_id: resolveMemberId(action.data.member_name as string),
        description: action.data.description || "",
      });
    } else if (action.type === "add_recurring") {
      const memberId = resolveMemberId(action.data.member_name as string);
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
    userName: profile?.first_name,
    members: members.map((m) => ({ name: m.name, role: m.role, emoji: m.emoji })),
    todayEvents: dayEvents.map((e) => ({ id: e.id, title: e.title, time: e.time, date: e.date, member: e.members?.name })),
    weekEvents: events.map((e) => ({ id: e.id, title: e.title, time: e.time, date: e.date, member: e.members?.name })),
    addresses: addresses.map((a) => ({ name: a.name, address: a.address })),
    contacts: contacts.map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
    wellbeingStreak,
    selectedDate: currentDate,
    selectedDayName: days[selectedDay].dayName,
    today: days[0].date,
  };

  const totalWeekEvents = events.length;

  return (
    <div className="px-4 py-4 animate-in gradient-bg" style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            {getGreeting()}, {profile?.first_name}
          </h1>
          <p className="text-sm capitalize mt-0.5" style={{ color: "var(--dim)" }}>
            {dateDisplay}
          </p>
        </div>
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-xl"
          style={{ background: "var(--surface2)" }}
        >
          {profile?.emoji || "👤"}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2 mt-5">
        <div className="card !mb-0 text-center !py-3">
          <p className="text-lg font-bold" style={{ color: "var(--accent)" }}>{dayEvents.length}</p>
          <p className="text-[10px]" style={{ color: "var(--dim)" }}>Aujourd&apos;hui</p>
        </div>
        <div className="card !mb-0 text-center !py-3">
          <p className="text-lg font-bold" style={{ color: "var(--teal)" }}>{totalWeekEvents}</p>
          <p className="text-[10px]" style={{ color: "var(--dim)" }}>Cette semaine</p>
        </div>
        <div className="card !mb-0 text-center !py-3">
          <p className="text-lg font-bold" style={{ color: "var(--warm)" }}>{wellbeingStreak}</p>
          <p className="text-[10px]" style={{ color: "var(--dim)" }}>Jours streak</p>
        </div>
      </div>

      {/* Next event card */}
      {nextEvent && (
        <div className="card flex items-center gap-3 mt-4 !mb-0" style={{ borderLeft: `3px solid var(--accent)` }}>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase" style={{ color: "var(--accent)" }}>Prochain</p>
            <p className="text-sm font-bold mt-0.5">{nextEvent.title}</p>
            <p className="text-xs" style={{ color: "var(--dim)" }}>{nextEvent.time}{nextEvent.members ? ` · ${nextEvent.members.name}` : ""}</p>
          </div>
          <span className="text-2xl">{nextEvent.members?.emoji || "📅"}</span>
        </div>
      )}

      {/* Flow card */}
      <div
        className="card flex items-center gap-3 mt-4 !mb-0 cursor-pointer"
        style={{ background: "var(--accent-soft)", border: "1px solid rgba(124,107,240,0.15)" }}
        onClick={() => setChatOpen(true)}
      >
        <div
          className="w-11 h-11 flex items-center justify-center rounded-full text-xl"
          style={{ background: "linear-gradient(135deg, var(--accent), #9B8BFF)" }}
        >
          🌊
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-bold">Flow</p>
          <p className="text-[11px]" style={{ color: "var(--dim)" }}>Demande-moi n&apos;importe quoi</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--green)", color: "#fff" }}>En ligne</span>
      </div>

      {/* Week calendar */}
      <div className="grid grid-cols-7 gap-1 mt-6 mb-2">
        {days.map((d, i) => {
          const date = new Date(d.date);
          const dayNum = date.getDate();
          const dayLetter = date.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3);
          const isSelected = selectedDay === i;
          const isToday = i === 0;
          const count = eventCounts[d.date] || 0;

          return (
            <button
              key={d.date}
              className="flex flex-col items-center py-2 rounded-2xl transition-all"
              style={{
                background: isSelected ? "var(--accent)" : "transparent",
                boxShadow: isSelected ? "0 4px 16px var(--accent-glow)" : "none",
              }}
              onClick={() => setSelectedDay(i)}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: isSelected ? "#fff" : "var(--faint)" }}>
                {dayLetter}
              </span>
              <span
                className="text-base font-bold mt-0.5"
                style={{ color: isSelected ? "#fff" : isToday ? "var(--accent)" : "var(--text)" }}
              >
                {dayNum}
              </span>
              {count > 0 && (
                <span
                  className="w-1.5 h-1.5 rounded-full mt-1"
                  style={{ background: isSelected ? "#fff" : "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Member filters */}
      {members.length > 0 && (
        <div className="flex justify-center gap-3 mb-3">
          <button
            className="flex flex-col items-center gap-1 transition-opacity"
            style={{ opacity: !filter ? 1 : 0.35 }}
            onClick={() => setFilter(null)}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
              style={{
                background: !filter ? "var(--accent-soft)" : "var(--surface2)",
                outline: !filter ? "2px solid var(--accent)" : "none",
                outlineOffset: 2,
              }}
            >
              👥
            </div>
            <span className="text-[9px] font-bold" style={{ color: !filter ? "var(--accent)" : "var(--dim)" }}>Tous</span>
          </button>
          {members.map((m) => {
            const active = filter === m.id;
            return (
              <button
                key={m.id}
                className="flex flex-col items-center gap-1 transition-opacity"
                style={{ opacity: active ? 1 : 0.35 }}
                onClick={() => setFilter(active ? null : m.id)}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                  style={{
                    background: "var(--surface2)",
                    outline: active ? `2px solid ${m.color}` : "none",
                    outlineOffset: 2,
                  }}
                >
                  {m.emoji}
                </div>
                <span className="text-[9px] font-bold" style={{ color: active ? m.color : "var(--dim)" }}>{m.name.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <p className="label">
        {selectedDay === 0 ? "Planning du jour" : `Planning — ${days[selectedDay].label}`}
      </p>
      <Timeline events={filteredEvents} onDelete={deleteEvent} />

      {filteredEvents.length === 0 && (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm" style={{ color: "var(--dim)" }}>Aucun evenement {selectedDay === 0 ? "aujourd'hui" : "ce jour"}</p>
          <button
            className="text-xs font-bold mt-2"
            style={{ color: "var(--accent)" }}
            onClick={() => setChatOpen(true)}
          >
            + Ajouter via Flow
          </button>
        </div>
      )}

      {/* FAB */}
      <button
        className="fixed flex items-center justify-center rounded-full text-white text-xl"
        style={{
          bottom: 100,
          right: "max(20px, calc(50% - 195px))",
          width: 54,
          height: 54,
          background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
          boxShadow: "0 4px 24px var(--accent-glow)",
          zIndex: 50,
        }}
        onClick={() => setChatOpen(true)}
      >
        🌊
      </button>

      {/* Notifications */}
      <NotificationManager events={events} enabled={true} />

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
