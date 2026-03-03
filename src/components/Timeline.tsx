"use client";

import type { Event } from "@/lib/types";

interface TimelineProps {
  events: Event[];
  onDelete: (id: string) => void;
}

export default function Timeline({ events, onDelete }: TimelineProps) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  const sorted = [...events].sort((a, b) => a.time.localeCompare(b.time));

  if (sorted.length === 0) return null;

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div
        className="absolute left-[7px] top-2 bottom-2 w-[2px] rounded-full"
        style={{ background: "linear-gradient(to bottom, var(--accent), rgba(124,107,240,0.1))" }}
      />

      {sorted.map((ev, i) => {
        const [h, m] = ev.time.split(":").map(Number);
        const isPast = h < currentHour || (h === currentHour && m < currentMin);
        const isNext = !isPast && (i === 0 || sorted.slice(0, i).every((e) => {
          const [eh, em] = e.time.split(":").map(Number);
          return eh < currentHour || (eh === currentHour && em < currentMin);
        }));

        return (
          <div
            key={ev.id}
            className="relative mb-2"
          >
            {/* Dot on the line */}
            <div
              className="absolute -left-[18px] top-5 w-3 h-3 rounded-full"
              style={{
                background: isNext ? "var(--accent)" : isPast ? "var(--surface2)" : "var(--surface2)",
                border: `2px solid ${isNext ? "var(--accent)" : "var(--glass-border)"}`,
                boxShadow: isNext ? "0 0 8px var(--accent-glow)" : "none",
              }}
            />

            <div
              className="card !mb-0 flex items-start gap-3"
              style={{
                opacity: isPast ? 0.4 : 1,
                borderLeft: isNext ? "2px solid var(--accent)" : undefined,
              }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>{ev.time}</p>
                  {isNext && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                      Prochain
                    </span>
                  )}
                  {ev.recurring && (
                    <span className="text-[9px]" style={{ color: "var(--dim)" }}>🔁</span>
                  )}
                </div>
                <p className="text-sm font-bold mt-0.5">{ev.title}</p>
                {ev.description && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--dim)" }}>{ev.description}</p>
                )}
                {ev.members && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="text-sm">{ev.members.emoji}</span>
                    <span className="text-xs" style={{ color: "var(--dim)" }}>{ev.members.name}</span>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: (ev.members as unknown as { color: string }).color || "var(--teal)" }} />
                  </div>
                )}
              </div>
              <button
                onClick={() => onDelete(ev.id)}
                className="text-xs opacity-30 hover:opacity-100 transition-opacity mt-1 p-1 rounded-lg"
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
