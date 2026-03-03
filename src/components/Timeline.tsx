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

  return (
    <div className="relative pl-6">
      {/* Vertical line */}
      <div
        className="absolute left-2 top-0 bottom-0 w-0.5"
        style={{ background: "linear-gradient(to bottom, var(--accent), var(--teal))" }}
      />

      {sorted.length === 0 && (
        <p className="text-xs py-4" style={{ color: "var(--dim)" }}>
          Aucun événement aujourd&apos;hui. Utilise Flow pour en ajouter !
        </p>
      )}

      {sorted.map((ev) => {
        const [h, m] = ev.time.split(":").map(Number);
        const isPast = h < currentHour || (h === currentHour && m < currentMin);

        return (
          <div
            key={ev.id}
            className="card flex items-start gap-3 relative"
            style={{ opacity: isPast ? 0.4 : 1 }}
          >
            {/* Dot on the line */}
            <div
              className="absolute -left-[18px] top-5 w-2.5 h-2.5 rounded-full"
              style={{ background: "var(--accent)", border: "2px solid var(--bg)" }}
            />

            <div className="flex-1">
              <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>{ev.time}</p>
              <p className="text-sm font-bold mt-0.5">{ev.title}</p>
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
              className="text-sm opacity-50 hover:opacity-100 transition-opacity mt-1"
            >
              🗑️
            </button>
          </div>
        );
      })}
    </div>
  );
}
