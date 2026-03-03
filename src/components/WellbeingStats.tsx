"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import DonutChart from "@/components/charts/DonutChart";
import BarChart from "@/components/charts/BarChart";

const ACTIVITY_META: Record<string, { emoji: string; color: string }> = {
  meditation: { emoji: "🧘", color: "#7C6BF0" },
  sport: { emoji: "💪", color: "#F06B7E" },
  yoga: { emoji: "🧘‍♀️", color: "#5ED4C8" },
  lecture: { emoji: "📖", color: "#F5C563" },
  sons: { emoji: "🎵", color: "#B39DDB" },
  respiration: { emoji: "🌬️", color: "#6BA3F0" },
};

interface Session {
  activity: string;
  minutes: number;
  date: string;
}

export default function WellbeingStats({ userId }: { userId: string }) {
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    async function load() {
      const daysBack = period === "week" ? 7 : 30;
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const { data } = await supabase
        .from("wellbeing_sessions")
        .select("activity, minutes, date")
        .eq("user_id", userId)
        .gte("date", since.toISOString().split("T")[0])
        .order("date", { ascending: true });

      if (data) setSessions(data as Session[]);
    }
    load();
  }, [userId, period]);

  // Donut data: minutes per activity
  const byActivity: Record<string, number> = {};
  for (const s of sessions) {
    byActivity[s.activity] = (byActivity[s.activity] || 0) + s.minutes;
  }
  const donutData = Object.entries(byActivity).map(([key, value]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    value,
    color: ACTIVITY_META[key]?.color || "var(--accent)",
    emoji: ACTIVITY_META[key]?.emoji || "📊",
  }));

  // Bar data: minutes per day
  const daysBack = period === "week" ? 7 : 30;
  const barData = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayLabel = period === "week"
      ? d.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 2)
      : d.getDate().toString();
    const total = sessions.filter((s) => s.date === dateStr).reduce((a, s) => a + s.minutes, 0);
    barData.push({ label: dayLabel, value: total });
  }

  const totalMinutes = sessions.reduce((a, s) => a + s.minutes, 0);
  const totalSessions = sessions.length;

  if (totalSessions === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="label !mb-0">Statistiques</p>
        <div className="flex gap-1">
          {(["week", "month"] as const).map((p) => (
            <button
              key={p}
              className="text-[10px] font-bold px-2.5 py-1 rounded-lg transition-colors"
              style={{
                background: period === p ? "var(--accent)" : "var(--surface2)",
                color: period === p ? "#fff" : "var(--dim)",
              }}
              onClick={() => setPeriod(p)}
            >
              {p === "week" ? "Semaine" : "Mois"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-2 mb-3">
        <div className="card !mb-0 flex-1 text-center !py-2">
          <p className="text-base font-bold" style={{ color: "var(--accent)" }}>{totalMinutes}</p>
          <p className="text-[9px]" style={{ color: "var(--dim)" }}>minutes</p>
        </div>
        <div className="card !mb-0 flex-1 text-center !py-2">
          <p className="text-base font-bold" style={{ color: "var(--teal)" }}>{totalSessions}</p>
          <p className="text-[9px]" style={{ color: "var(--dim)" }}>seances</p>
        </div>
      </div>

      {/* Donut */}
      <div className="card !mb-3">
        <DonutChart data={donutData} />
      </div>

      {/* Bar */}
      <div className="card !mb-0">
        <p className="text-xs font-bold mb-2">Minutes par jour</p>
        <BarChart data={barData} />
      </div>
    </div>
  );
}
