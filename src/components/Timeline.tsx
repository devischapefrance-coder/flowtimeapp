"use client";

import { useState } from "react";
import type { Event } from "@/lib/types";
import { getCategoryColor } from "@/lib/categories";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TimelineProps {
  events: Event[];
  onDelete: (id: string) => void;
  onDeleteSeries?: (ev: Event) => void;
  onEditSeries?: (ev: Event) => void;
  onReorder?: (eventId: string, newTime: string) => void;
}

function SortableEvent({
  ev,
  isPast,
  isNext,
  catColor,
  onDelete,
  onDeleteSeries,
  onEditSeries,
  menuOpen,
  setMenuOpen,
}: {
  ev: Event;
  isPast: boolean;
  isNext: boolean;
  catColor: string;
  onDelete: (id: string) => void;
  onDeleteSeries?: (ev: Event) => void;
  onEditSeries?: (ev: Event) => void;
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ev.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isPast ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative mb-2">
      {/* Dot on the line */}
      <div
        className="absolute -left-[18px] top-5 w-3 h-3 rounded-full"
        style={{
          background: isNext ? "var(--accent)" : isPast ? "var(--surface2)" : catColor,
          border: `2px solid ${isNext ? "var(--accent)" : isPast ? "var(--glass-border)" : catColor}`,
          boxShadow: isNext ? "0 0 8px var(--accent-glow)" : "none",
        }}
      />

      <div
        className="card !mb-0 flex items-start gap-3"
        style={{
          borderLeft: `3px solid ${isNext ? "var(--accent)" : catColor}`,
        }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center cursor-grab active:cursor-grabbing text-xs pt-1"
          style={{ color: "var(--faint)", touchAction: "none" }}
          {...attributes}
          {...listeners}
        >
          ⠿
        </div>
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
            {ev.category && ev.category !== "general" && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ background: `${catColor}20`, color: catColor }}
              >
                {ev.category}
              </span>
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
        <div className="flex items-center gap-1">
          {ev.recurring && (onDeleteSeries || onEditSeries) && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(menuOpen === ev.id ? null : ev.id)}
                className="text-xs opacity-30 hover:opacity-100 transition-opacity p-1 rounded-lg"
                style={{ background: "var(--surface2)" }}
              >
                ⋯
              </button>
              {menuOpen === ev.id && (
                <div
                  className="absolute right-0 top-8 rounded-xl shadow-lg py-1 z-50"
                  style={{ background: "var(--surface-solid)", border: "1px solid var(--glass-border)", minWidth: 180 }}
                >
                  <button
                    className="w-full text-left text-xs px-3 py-2 hover:opacity-80"
                    onClick={() => { setMenuOpen(null); onDelete(ev.id); }}
                  >
                    🗑️ Supprimer cet event
                  </button>
                  {onEditSeries && (
                    <button
                      className="w-full text-left text-xs px-3 py-2 hover:opacity-80"
                      onClick={() => { setMenuOpen(null); onEditSeries(ev); }}
                    >
                      ✏️ Modifier la serie
                    </button>
                  )}
                  {onDeleteSeries && (
                    <button
                      className="w-full text-left text-xs px-3 py-2 hover:opacity-80"
                      style={{ color: "var(--red, #ef4444)" }}
                      onClick={() => { setMenuOpen(null); onDeleteSeries(ev); }}
                    >
                      🗑️ Supprimer la serie
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => onDelete(ev.id)}
            className="text-xs opacity-30 hover:opacity-100 transition-opacity mt-1 p-1 rounded-lg"
            style={{ background: "var(--surface2)" }}
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Timeline({ events, onDelete, onDeleteSeries, onEditSeries, onReorder }: TimelineProps) {
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const sorted = [...events].sort((a, b) => a.time.localeCompare(b.time));

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  if (sorted.length === 0) return null;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;

    const oldIndex = sorted.findIndex((e) => e.id === active.id);
    const newIndex = sorted.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Calculate new time based on position
    const targetEvent = sorted[newIndex];
    onReorder(active.id as string, targetEvent.time);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sorted.map((e) => e.id)} strategy={verticalListSortingStrategy}>
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
            const catColor = getCategoryColor(ev.category);

            return (
              <SortableEvent
                key={ev.id}
                ev={ev}
                isPast={isPast}
                isNext={isNext}
                catColor={catColor}
                onDelete={onDelete}
                onDeleteSeries={onDeleteSeries}
                onEditSeries={onEditSeries}
                menuOpen={menuOpen}
                setMenuOpen={setMenuOpen}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
