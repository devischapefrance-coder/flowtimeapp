"use client";

import { useState, useRef, useEffect } from "react";
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
  allEvents?: Event[];
  selectedDate?: string;
  viewMode?: "perso" | "famille";
  onDelete: (id: string) => void;
  onDeleteSeries?: (ev: Event) => void;
  onEditSeries?: (ev: Event) => void;
  onReorder?: (eventId: string, newTime: string) => void;
  onEditTitle?: (eventId: string, newTitle: string) => void;
  onEditDescription?: (eventId: string, newDesc: string) => void;
  getAvatarUrl?: (userId: string) => string | null;
}

function findConflicts(events: Event[]): Set<string> {
  const conflictIds = new Set<string>();
  const byTime: Record<string, Event[]> = {};
  for (const ev of events) {
    if (!ev.time) continue;
    const key = ev.time;
    if (!byTime[key]) byTime[key] = [];
    byTime[key].push(ev);
  }
  for (const group of Object.values(byTime)) {
    if (group.length > 1) {
      for (const ev of group) conflictIds.add(ev.id);
    }
  }
  return conflictIds;
}

function SortableEvent({
  ev,
  isPast,
  isNext,
  isConflict,
  catColor,
  showScopeIcon,
  onDelete,
  onDeleteSeries,
  onEditSeries,
  onReorder,
  onEditTitle,
  onEditDescription,
  menuOpen,
  setMenuOpen,
  getAvatarUrl,
}: {
  ev: Event;
  isPast: boolean;
  isNext: boolean;
  isConflict: boolean;
  catColor: string;
  showScopeIcon: boolean;
  onDelete: (id: string) => void;
  onDeleteSeries?: (ev: Event) => void;
  onEditSeries?: (ev: Event) => void;
  onReorder?: (eventId: string, newTime: string) => void;
  onEditTitle?: (eventId: string, newTitle: string) => void;
  onEditDescription?: (eventId: string, newDesc: string) => void;
  menuOpen: string | null;
  setMenuOpen: (id: string | null) => void;
  getAvatarUrl?: (userId: string) => string | null;
}) {
  const [editingTime, setEditingTime] = useState(false);
  const [tempTime, setTempTime] = useState(ev.time);
  const [editingTitle, setEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(ev.title);
  const [editingDesc, setEditingDesc] = useState(false);
  const [tempDesc, setTempDesc] = useState(ev.description || "");
  const timeInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (editingTime && timeInputRef.current) {
      timeInputRef.current.focus();
    }
  }, [editingTime]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (editingDesc && descInputRef.current) {
      descInputRef.current.focus();
    }
  }, [editingDesc]);

  function commitTime() {
    setEditingTime(false);
    if (tempTime && tempTime !== ev.time && onReorder) {
      onReorder(ev.id, tempTime);
    }
  }

  function commitTitle() {
    setEditingTitle(false);
    const trimmed = tempTitle.trim();
    if (trimmed && trimmed !== ev.title && onEditTitle) {
      onEditTitle(ev.id, trimmed);
    }
  }

  function commitDesc() {
    setEditingDesc(false);
    const trimmed = tempDesc.trim();
    if (trimmed !== (ev.description || "") && onEditDescription) {
      onEditDescription(ev.id, trimmed);
    }
  }

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
            {editingTime ? (
              <input
                ref={timeInputRef}
                type="time"
                value={tempTime}
                onChange={(e) => setTempTime(e.target.value)}
                onBlur={commitTime}
                onKeyDown={(e) => { if (e.key === "Enter") commitTime(); }}
                className="text-sm font-bold px-1 py-0.5 rounded-lg w-[80px]"
                style={{
                  color: "var(--accent)",
                  background: "var(--surface2)",
                  border: "1px solid var(--accent)",
                }}
              />
            ) : (
              <button
                onClick={() => { setTempTime(ev.time); setEditingTime(true); }}
                className="text-sm font-bold hover:underline"
                style={{ color: "var(--accent)" }}
                title="Modifier l'heure"
              >
                {ev.time}
              </button>
            )}
            {isNext && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                Prochain
              </span>
            )}
            {isConflict && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(240,107,126,0.15)", color: "var(--red)" }}>
                Conflit
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
          {editingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              className="text-sm font-bold mt-0.5 px-1 py-0.5 rounded-lg w-full"
              style={{ background: "var(--surface2)", border: "1px solid var(--accent)", color: "var(--text)" }}
            />
          ) : (
            <p
              className="text-sm font-bold mt-0.5 cursor-pointer flex items-center gap-1.5"
              onClick={() => { if (onEditTitle) { setTempTitle(ev.title); setEditingTitle(true); } }}
              title={onEditTitle ? "Modifier le titre" : undefined}
            >
              {ev.title}
              {showScopeIcon && ev.scope === "perso" && (
                <span title="Personnel" style={{ color: "var(--dim)" }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                </span>
              )}
            </p>
          )}
          {editingDesc ? (
            <input
              ref={descInputRef}
              type="text"
              value={tempDesc}
              onChange={(e) => setTempDesc(e.target.value)}
              onBlur={commitDesc}
              onKeyDown={(e) => { if (e.key === "Enter") commitDesc(); if (e.key === "Escape") setEditingDesc(false); }}
              className="text-xs mt-0.5 px-1 py-0.5 rounded-lg w-full"
              style={{ background: "var(--surface2)", border: "1px solid var(--accent)", color: "var(--dim)" }}
              placeholder="Ajouter une description..."
            />
          ) : ev.description && ev.description !== ev.title ? (
            <p
              className="text-xs mt-0.5 cursor-pointer"
              style={{ color: "var(--dim)" }}
              onClick={() => { if (onEditDescription) { setTempDesc(ev.description || ""); setEditingDesc(true); } }}
            >
              {ev.description}
            </p>
          ) : onEditDescription ? (
            <p
              className="text-[10px] mt-0.5 cursor-pointer"
              style={{ color: "var(--faint)" }}
              onClick={() => { setTempDesc(""); setEditingDesc(true); }}
            >
              + description
            </p>
          ) : null}
          {ev.members && (() => {
            const avatarSrc = ev.members.user_id && getAvatarUrl ? getAvatarUrl(ev.members.user_id) : null;
            return (
            <div className="flex items-center gap-1.5 mt-1.5">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
              ) : (
                <span className="text-sm">{ev.members.emoji}</span>
              )}
              <span className="text-xs" style={{ color: "var(--dim)" }}>{ev.members.name}</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: (ev.members as unknown as { color: string }).color || "var(--teal)" }} />
            </div>
            );
          })()}
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

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Timeline({ events, allEvents, selectedDate, viewMode, onDelete, onDeleteSeries, onEditSeries, onReorder, onEditTitle, onEditDescription, getAvatarUrl }: TimelineProps) {
  const now = new Date();
  const todayStr = localDateStr(now);
  const isToday = !selectedDate || selectedDate === todayStr;
  const isPastDay = !!selectedDate && selectedDate < todayStr;
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const sorted = [...events].sort((a, b) => a.time.localeCompare(b.time));
  const conflictIds = findConflicts(allEvents || events);

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
            const isPast = isPastDay || (isToday && (h < currentHour || (h === currentHour && m < currentMin)));
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
                isConflict={conflictIds.has(ev.id)}
                catColor={catColor}
                showScopeIcon={viewMode === "perso"}
                onDelete={onDelete}
                onDeleteSeries={onDeleteSeries}
                onEditSeries={onEditSeries}
                onReorder={onReorder}
                onEditTitle={onEditTitle}
                onEditDescription={onEditDescription}
                menuOpen={menuOpen}
                setMenuOpen={setMenuOpen}
                getAvatarUrl={getAvatarUrl}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
