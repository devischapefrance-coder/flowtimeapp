"use client";

import { useRef, useMemo } from "react";
import type { Event } from "@/lib/types";
import { getCategoryColor } from "@/lib/categories";

interface DayAgendaProps {
  events: Event[];
  selectedDate?: string;
  onDelete: (id: string) => void;
  onReorder?: (eventId: string, newTime: string) => void;
  getAvatarUrl?: (userId: string) => string | null;
}

const START_HOUR = 6;
const END_HOUR = 22;
const SLOT_HEIGHT = 60; // px per hour
const EVENT_MIN_HEIGHT = 36; // min px height of an event block

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Compute column layout for overlapping events
function computeColumns(events: Event[]): Map<string, { col: number; totalCols: number }> {
  const result = new Map<string, { col: number; totalCols: number }>();

  // Filter and sort by time
  const timed = events
    .filter((ev) => ev.time)
    .map((ev) => ({
      id: ev.id,
      start: timeToMinutes(ev.time!),
      end: timeToMinutes(ev.time!) + EVENT_MIN_HEIGHT, // assume min duration for overlap detection
    }))
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  // Group into overlapping clusters
  const clusters: typeof timed[] = [];
  let current: typeof timed = [];

  for (const ev of timed) {
    if (current.length === 0 || ev.start < Math.max(...current.map((e) => e.end))) {
      current.push(ev);
    } else {
      clusters.push(current);
      current = [ev];
    }
  }
  if (current.length > 0) clusters.push(current);

  // Assign columns within each cluster
  for (const cluster of clusters) {
    const cols: string[][] = [];
    for (const ev of cluster) {
      let placed = false;
      for (let c = 0; c < cols.length; c++) {
        const lastInCol = cols[c][cols[c].length - 1];
        const lastEv = cluster.find((e) => e.id === lastInCol)!;
        if (ev.start >= lastEv.end) {
          cols[c].push(ev.id);
          placed = true;
          break;
        }
      }
      if (!placed) {
        cols.push([ev.id]);
      }
    }
    const totalCols = cols.length;
    for (let c = 0; c < cols.length; c++) {
      for (const id of cols[c]) {
        result.set(id, { col: c, totalCols });
      }
    }
  }

  return result;
}

export default function DayAgenda({ events, selectedDate, onDelete, getAvatarUrl }: DayAgendaProps) {
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
  const columns = useMemo(() => computeColumns(events), [events]);

  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    hours.push(h);
  }

  // Available width starts at left-12 (48px) with 4px right margin
  const LEFT_OFFSET = 48; // left-12 = 3rem = 48px
  const RIGHT_MARGIN = 4;

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

        const layout = columns.get(ev.id) || { col: 0, totalCols: 1 };
        const colWidth = `calc((100% - ${LEFT_OFFSET + RIGHT_MARGIN}px) / ${layout.totalCols})`;
        const colLeft = `calc(${LEFT_OFFSET}px + (100% - ${LEFT_OFFSET + RIGHT_MARGIN}px) * ${layout.col} / ${layout.totalCols})`;

        return (
          <div
            key={ev.id}
            className="absolute rounded-xl px-2.5 py-1.5"
            style={{
              top,
              left: colLeft,
              width: colWidth,
              minHeight: EVENT_MIN_HEIGHT,
              background: `${catColor}18`,
              borderLeft: `3px solid ${catColor}`,
              opacity: isPast ? 0.5 : 1,
              zIndex: 5 + layout.col,
              transition: "top 0.2s ease",
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{ev.title}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]" style={{ color: "var(--dim)" }}>{ev.time}</span>
                    {ev.members && (() => {
                      const avatarSrc = ev.members.user_id && getAvatarUrl ? getAvatarUrl(ev.members.user_id) : null;
                      return (
                      <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--dim)" }}>
                        {avatarSrc ? (
                          <img src={avatarSrc} alt="" className="w-4 h-4 rounded-full object-cover inline-block" />
                        ) : (
                          ev.members!.emoji
                        )} {ev.members!.name}
                      </span>
                      );
                    })()}
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
