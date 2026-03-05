"use client";

import { useState, useRef, useCallback } from "react";
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

function pxToTime(px: number): string {
  const totalMinutes = (px / SLOT_HEIGHT) * 60 + START_HOUR * 60;
  // Snap to 5-minute intervals
  const snapped = Math.round(totalMinutes / 5) * 5;
  const h = Math.floor(snapped / 60);
  const m = snapped % 60;
  const clampedH = Math.max(START_HOUR, Math.min(END_HOUR, h));
  return `${String(clampedH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DayAgenda({ events, selectedDate, onDelete, onReorder }: DayAgendaProps) {
  const now = new Date();
  const todayStr = localDateStr(now);
  const isToday = !selectedDate || selectedDate === todayStr;
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const nowOffset = currentHour >= START_HOUR && currentHour <= END_HOUR
    ? (currentHour - START_HOUR) * SLOT_HEIGHT + (currentMin / 60) * SLOT_HEIGHT
    : -1;

  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragStartY = useRef(0);
  const dragStartTop = useRef(0);

  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) {
    hours.push(h);
  }

  const getEventTop = useCallback((ev: Event): number => {
    if (!ev.time) return 0;
    const [h, m] = ev.time.split(":").map(Number);
    return (h - START_HOUR) * SLOT_HEIGHT + (m / 60) * SLOT_HEIGHT;
  }, []);

  function handlePointerDown(e: React.PointerEvent, ev: Event) {
    if (!onReorder) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    dragStartY.current = e.clientY;
    dragStartTop.current = getEventTop(ev);
    setDraggingId(ev.id);
    setDragOffset(dragStartTop.current);

    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!draggingId) return;
    e.preventDefault();
    const deltaY = e.clientY - dragStartY.current;
    const newTop = Math.max(0, Math.min((END_HOUR - START_HOUR) * SLOT_HEIGHT, dragStartTop.current + deltaY));
    setDragOffset(newTop);
  }

  function handlePointerUp() {
    if (!draggingId || dragOffset === null || !onReorder) {
      setDraggingId(null);
      setDragOffset(null);
      return;
    }
    const newTime = pxToTime(dragOffset);
    const ev = events.find((e) => e.id === draggingId);
    if (ev && newTime !== ev.time) {
      onReorder(draggingId, newTime);
    }
    setDraggingId(null);
    setDragOffset(null);
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

      {/* Drop preview line */}
      {draggingId && dragOffset !== null && (
        <div
          className="absolute left-10 right-1 flex items-center z-20 pointer-events-none"
          style={{ top: dragOffset }}
        >
          <span className="text-[9px] font-bold px-1 rounded" style={{ background: "var(--accent)", color: "#fff" }}>
            {pxToTime(dragOffset)}
          </span>
          <div className="flex-1 h-[2px]" style={{ background: "var(--accent)" }} />
        </div>
      )}

      {/* Events */}
      {events.map((ev) => {
        if (!ev.time) return null;
        const [h, m] = ev.time.split(":").map(Number);
        if (h < START_HOUR || h > END_HOUR) return null;
        const isDragging = draggingId === ev.id;
        const top = isDragging && dragOffset !== null ? dragOffset : getEventTop(ev);
        const catColor = getCategoryColor(ev.category);
        const isPast = isToday && (h < currentHour || (h === currentHour && m < currentMin));

        return (
          <div
            key={ev.id}
            className="absolute left-12 right-1 rounded-xl px-3 py-1.5"
            style={{
              top,
              minHeight: 36,
              background: `${catColor}18`,
              borderLeft: `3px solid ${catColor}`,
              opacity: isDragging ? 0.8 : isPast ? 0.5 : 1,
              zIndex: isDragging ? 30 : 5,
              boxShadow: isDragging ? "0 4px 20px rgba(0,0,0,0.3)" : "none",
              transition: isDragging ? "none" : "top 0.2s ease",
              cursor: onReorder ? "grab" : "default",
              touchAction: onReorder ? "none" : "auto",
            }}
            onPointerDown={(e) => handlePointerDown(e, ev)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {onReorder && (
                  <span className="text-[10px] shrink-0" style={{ color: "var(--faint)" }}>⠿</span>
                )}
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
                onPointerDown={(e) => e.stopPropagation()}
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
