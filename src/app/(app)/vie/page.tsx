"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import Modal from "@/components/Modal";
import type { Note, Birthday, Member } from "@/lib/types";

const NOTE_CATEGORIES = [
  { value: "info", label: "Info", color: "var(--teal)", emoji: "💡" },
  { value: "important", label: "Important", color: "var(--red, #ef4444)", emoji: "🔴" },
  { value: "rappel", label: "Rappel", color: "var(--warm, #f59e0b)", emoji: "🔔" },
] as const;

function getCategoryStyle(cat: string) {
  const c = NOTE_CATEGORIES.find((n) => n.value === cat);
  return { color: c?.color || "var(--teal)", emoji: c?.emoji || "💡" };
}

function getBirthdayCountdown(dateStr: string): { days: number; label: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateStr.split("-").map(Number);
  const next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next.setFullYear(next.getFullYear() + 1);
  const diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return { days: 0, label: "Aujourd'hui !" };
  if (diff === 1) return { days: 1, label: "Demain !" };
  return { days: diff, label: `Dans ${diff} jours` };
}

function getAge(dateStr: string): number {
  const [year] = dateStr.split("-").map(Number);
  const now = new Date();
  return now.getFullYear() - year;
}

export default function ViePage() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<"notes" | "anniversaires">("notes");

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteModal, setNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState<string>("info");
  const [notePinned, setNotePinned] = useState(false);

  // Birthdays state
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [bdayModal, setBdayModal] = useState(false);
  const [editingBday, setEditingBday] = useState<Birthday | null>(null);
  const [bdayName, setBdayName] = useState("");
  const [bdayDate, setBdayDate] = useState("");
  const [bdayEmoji, setBdayEmoji] = useState("🎂");
  const [bdayMemberId, setBdayMemberId] = useState<string>("");

  const loadData = useCallback(async () => {
    if (!profile?.family_id) return;
    const [notesRes, bdayRes, memRes] = await Promise.all([
      supabase.from("notes").select("*").eq("family_id", profile.family_id).order("pinned", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("birthdays").select("*").eq("family_id", profile.family_id),
      supabase.from("members").select("*").eq("family_id", profile.family_id),
    ]);
    if (notesRes.data) setNotes(notesRes.data as Note[]);
    if (bdayRes.data) setBirthdays(bdayRes.data as Birthday[]);
    if (memRes.data) setMembers(memRes.data as Member[]);
  }, [profile?.family_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Notes CRUD ---
  function openNewNote() {
    setEditingNote(null);
    setNoteTitle("");
    setNoteContent("");
    setNoteCategory("info");
    setNotePinned(false);
    setNoteModal(true);
  }

  function openEditNote(n: Note) {
    setEditingNote(n);
    setNoteTitle(n.title);
    setNoteContent(n.content);
    setNoteCategory(n.category);
    setNotePinned(n.pinned);
    setNoteModal(true);
  }

  async function saveNote() {
    if (!profile?.family_id || !noteTitle.trim()) return;
    if (editingNote) {
      await supabase.from("notes").update({
        title: noteTitle.trim(),
        content: noteContent.trim(),
        category: noteCategory,
        pinned: notePinned,
        updated_at: new Date().toISOString(),
      }).eq("id", editingNote.id);
    } else {
      await supabase.from("notes").insert({
        family_id: profile.family_id,
        title: noteTitle.trim(),
        content: noteContent.trim(),
        category: noteCategory,
        pinned: notePinned,
        author_name: profile.first_name || "",
      });
    }
    setNoteModal(false);
    loadData();
  }

  async function deleteNote(id: string) {
    await supabase.from("notes").delete().eq("id", id);
    loadData();
  }

  // --- Birthday CRUD ---
  function openNewBday() {
    setEditingBday(null);
    setBdayName("");
    setBdayDate("");
    setBdayEmoji("🎂");
    setBdayMemberId("");
    setBdayModal(true);
  }

  function openEditBday(b: Birthday) {
    setEditingBday(b);
    setBdayName(b.name);
    setBdayDate(b.date);
    setBdayEmoji(b.emoji);
    setBdayMemberId(b.member_id || "");
    setBdayModal(true);
  }

  async function saveBday() {
    if (!profile?.family_id || !bdayName.trim() || !bdayDate) return;
    if (editingBday) {
      await supabase.from("birthdays").update({
        name: bdayName.trim(),
        date: bdayDate,
        emoji: bdayEmoji,
        member_id: bdayMemberId || null,
      }).eq("id", editingBday.id);
    } else {
      await supabase.from("birthdays").insert({
        family_id: profile.family_id,
        name: bdayName.trim(),
        date: bdayDate,
        emoji: bdayEmoji,
        member_id: bdayMemberId || null,
      });
    }
    setBdayModal(false);
    loadData();
  }

  async function deleteBday(id: string) {
    await supabase.from("birthdays").delete().eq("id", id);
    loadData();
  }

  // Sort birthdays by next occurrence
  const sortedBirthdays = [...birthdays].sort((a, b) => {
    return getBirthdayCountdown(a.date).days - getBirthdayCountdown(b.date).days;
  });

  return (
    <div className="px-4 py-4 animate-in gradient-bg" style={{ paddingBottom: 100 }}>
      <h1 className="text-xl font-bold mb-4">Vie de famille</h1>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-5">
        {(["notes", "anniversaires"] as const).map((t) => (
          <button
            key={t}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{
              background: tab === t ? "var(--accent)" : "var(--surface2)",
              color: tab === t ? "#fff" : "var(--dim)",
              boxShadow: tab === t ? "0 4px 16px var(--accent-glow)" : "none",
            }}
            onClick={() => setTab(t)}
          >
            {t === "notes" ? "📝 Notes" : "🎂 Anniversaires"}
          </button>
        ))}
      </div>

      {/* Notes tab */}
      {tab === "notes" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="label !mb-0">Notes partagees</p>
            <button
              className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={openNewNote}
            >
              + Ajouter
            </button>
          </div>

          {notes.length === 0 && (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">📝</p>
              <p className="text-sm" style={{ color: "var(--dim)" }}>Aucune note pour le moment</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {notes.map((n) => {
              const style = getCategoryStyle(n.category);
              return (
                <div
                  key={n.id}
                  className="card !mb-0 cursor-pointer"
                  style={{ borderLeft: `3px solid ${style.color}` }}
                  onClick={() => openEditNote(n)}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{style.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold truncate">{n.title}</p>
                        {n.pinned && <span className="text-xs">📌</span>}
                      </div>
                      {n.content && (
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--dim)" }}>{n.content}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                          style={{ background: `${style.color}20`, color: style.color }}
                        >
                          {NOTE_CATEGORIES.find((c) => c.value === n.category)?.label}
                        </span>
                        {n.author_name && (
                          <span className="text-[10px]" style={{ color: "var(--faint)" }}>par {n.author_name}</span>
                        )}
                      </div>
                    </div>
                    <button
                      className="text-xs p-1 rounded-full shrink-0"
                      style={{ color: "var(--red, #ef4444)" }}
                      onClick={(e) => { e.stopPropagation(); deleteNote(n.id); }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Anniversaires tab */}
      {tab === "anniversaires" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="label !mb-0">Anniversaires</p>
            <button
              className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={openNewBday}
            >
              + Ajouter
            </button>
          </div>

          {sortedBirthdays.length === 0 && (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🎂</p>
              <p className="text-sm" style={{ color: "var(--dim)" }}>Aucun anniversaire enregistre</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {sortedBirthdays.map((b) => {
              const countdown = getBirthdayCountdown(b.date);
              const age = getAge(b.date);
              const isToday = countdown.days === 0;
              return (
                <div
                  key={b.id}
                  className="card !mb-0 cursor-pointer"
                  style={{
                    borderLeft: isToday ? "3px solid var(--accent)" : undefined,
                    background: isToday ? "var(--accent-soft)" : undefined,
                  }}
                  onClick={() => openEditBday(b)}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{b.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">{b.name}</p>
                      <p className="text-xs" style={{ color: "var(--dim)" }}>
                        {new Date(b.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                        {" · "}{age} ans
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className="text-xs font-bold"
                        style={{ color: isToday ? "var(--accent)" : countdown.days <= 7 ? "var(--warm, #f59e0b)" : "var(--dim)" }}
                      >
                        {countdown.label}
                      </p>
                    </div>
                    <button
                      className="text-xs p-1 rounded-full shrink-0"
                      style={{ color: "var(--red, #ef4444)" }}
                      onClick={(e) => { e.stopPropagation(); deleteBday(b.id); }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Note Modal */}
      <Modal open={noteModal} onClose={() => setNoteModal(false)} title={editingNote ? "Modifier la note" : "Nouvelle note"}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Titre</label>
            <input
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="Titre de la note..."
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Contenu</label>
            <textarea
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)", minHeight: 80 }}
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Contenu..."
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Categorie</label>
            <div className="flex gap-2">
              {NOTE_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: noteCategory === c.value ? `${c.color}20` : "var(--surface2)",
                    color: noteCategory === c.value ? c.color : "var(--dim)",
                    border: noteCategory === c.value ? `1px solid ${c.color}` : "1px solid transparent",
                  }}
                  onClick={() => setNoteCategory(c.value)}
                >
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={notePinned}
              onChange={(e) => setNotePinned(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">📌 Epingler cette note</span>
          </label>
          <button
            className="w-full py-3 rounded-xl font-bold text-sm"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={saveNote}
          >
            {editingNote ? "Modifier" : "Ajouter"}
          </button>
        </div>
      </Modal>

      {/* Birthday Modal */}
      <Modal open={bdayModal} onClose={() => setBdayModal(false)} title={editingBday ? "Modifier l'anniversaire" : "Nouvel anniversaire"}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Nom</label>
            <input
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={bdayName}
              onChange={(e) => setBdayName(e.target.value)}
              placeholder="Nom de la personne..."
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Date de naissance</label>
            <input
              type="date"
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={bdayDate}
              onChange={(e) => setBdayDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Emoji</label>
            <div className="flex gap-2">
              {["🎂", "🎉", "🎁", "🎈", "👑", "❤️"].map((e) => (
                <button
                  key={e}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                  style={{
                    background: bdayEmoji === e ? "var(--accent-soft)" : "var(--surface2)",
                    border: bdayEmoji === e ? "1px solid var(--accent)" : "1px solid transparent",
                  }}
                  onClick={() => setBdayEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          {members.length > 0 && (
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Membre de la famille (optionnel)</label>
              <select
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
                value={bdayMemberId}
                onChange={(e) => setBdayMemberId(e.target.value)}
              >
                <option value="">Aucun</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>
                ))}
              </select>
            </div>
          )}
          <button
            className="w-full py-3 rounded-xl font-bold text-sm"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={saveBday}
          >
            {editingBday ? "Modifier" : "Ajouter"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
