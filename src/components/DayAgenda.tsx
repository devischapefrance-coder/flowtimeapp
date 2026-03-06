"use client";

import { useRef } from "react";
import type { Event } from "@/lib/types";
import { getCategoryColor } from "@/lib/categories";

interface DayAgendaProps {
  events: Event[];
  selectedDate?: string;
  onDelete: (id: string) => void;
  onReorder?: (eventId: string, newTime: string) => void;
}

const START_HOUR = 6;
const END_HOUR = 22;
const SLOT_HEIGHT = 60; // px per hour

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DayAgenda({ events, selectedDate, onDelete }: DayAgendaProps) {
  const now = new Date();
  const todayStr = localDateStr(now);
  const isToday = !selectedDate || selectedDate === todayStr;
  const isPastDay = !!selectedDate && selectedDate < todayStr;
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const nowOffset = currentHour >= START_HOUR && currentHour <= END_HOUR
    ? (currentHour - START_HOUR) * SLOT_HEIGHT + (currentMin / 60) * SLOT_HEIGHT
    : -1;

  const containerRef = useRef<HTMLDivElement>(null);

  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    hours.push(h);
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ minHeight: (END_HOUR - START_HOUR + 1) * SLOT_HEIGHT }}
    >
      {/* Hour grid lines */}
      {hours.map((h) => (
        <div
          key={h}
          className="absolute w-full flex items-start"
          style={{ top: (h - START_HOUR) * SLOT_HEIGHT }}
        >
          <span
            className="text-[10px] font-bold w-10 text-right pr-2 -mt-1.5 shrink-0"
            style={{ color: "var(--faint)" }}
          >
            {String(h).padStart(2, "0")}h
          </span>
          <div
            className="flex-1 border-t"
            style={{ borderColor: "var(--glass-border)" }}
          />
        </div>
      ))}

      {/* Now indicator */}
      {nowOffset >= 0 && (
        <div
          className="absolute left-10 right-0 flex items-center z-10"
          style={{ top: nowOffset }}
        >
          <div className="w-2 h-2 rounded-full" style={{ background: "var(--red)" }} />
          <div className="flex-1 h-[1.5px]" style={{ background: "var(--red)" }} />
        </div>
      )}

      {/* Events */}
      {events.map((ev) => {
        if (!ev.time) return null;
        const [h, m] = ev.time.split(":").map(Number);
        if (h < START_HOUR || h > END_HOUR) return null;
        const top = (h - START_HOUR) * SLOT_HEIGHT + (m / 60) * SLOT_HEIGHT;
        const catColor = getCategoryColor(ev.category);
        const isPast = isPastDay || (isToday && (h < currentHour || (h === currentHour && m < currentMin)));

        return (
          <div
            key={ev.id}
            className="absolute left-12 right-1 rounded-xl px-3 py-1.5"
            style={{
              top,
              minHeight: 36,
              background: `${catColor}18`,
              borderLeft: `3px solid ${catColor}`,
              opacity: isPast ? 0.5 : 1,
              zIndex: 5,
              transition: "top 0.2s ease",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{ev.title}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]" style={{ color: "var(--dim)" }}>{ev.time}</span>
                    {ev.members && (
                      <span className="text-[10px]" style={{ color: "var(--dim)" }}>
                        {ev.members.emoji} {ev.members.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }}
                className="text-[10px] opacity-30 hover:opacity-100 p-1 rounded-lg shrink-0"
                style={{ background: "var(--surface2)" }}
              >
                🗑️
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
