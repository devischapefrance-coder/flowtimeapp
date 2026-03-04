"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import { useRealtimeNotes } from "@/lib/realtime";
import Modal from "@/components/Modal";
import type { Note, Birthday, Member, NoteComment, ChecklistItem, Attachment } from "@/lib/types";

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
  const [, month, day] = dateStr.split("-").map(Number);
  const next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next.setFullYear(next.getFullYear() + 1);
  const diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return { days: 0, label: "Aujourd'hui !" };
  if (diff === 1) return { days: 1, label: "Demain !" };
  return { days: diff, label: `Dans ${diff} jours` };
}

function getAge(dateStr: string): number {
  const [year] = dateStr.split("-").map(Number);
  return new Date().getFullYear() - year;
}

function genId() {
  return crypto.randomUUID();
}

export default function ViePage() {
  const { profile } = useProfile();
  const [tab, setTab] = useState<"notes" | "anniversaires">("notes");

  // Notes state
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteModal, setNoteModal] = useState(false);
  const [detailNote, setDetailNote] = useState<Note | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteCategory, setNoteCategory] = useState<string>("info");
  const [notePinned, setNotePinned] = useState(false);
  const [noteChecklist, setNoteChecklist] = useState<ChecklistItem[]>([]);
  const [noteAttachments, setNoteAttachments] = useState<Attachment[]>([]);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [uploading, setUploading] = useState(false);

  // Search / filter
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");

  // Comments
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [newComment, setNewComment] = useState("");

  // Birthdays state
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [bdayModal, setBdayModal] = useState(false);
  const [editingBday, setEditingBday] = useState<Birthday | null>(null);
  const [bdayName, setBdayName] = useState("");
  const [bdayDate, setBdayDate] = useState("");
  const [bdayEmoji, setBdayEmoji] = useState("🎂");
  const [bdayMemberId, setBdayMemberId] = useState<string>("");

  // Comment counts per note
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    if (!profile?.family_id) return;
    const [notesRes, bdayRes, memRes] = await Promise.all([
      supabase.from("notes").select("*").eq("family_id", profile.family_id).order("pinned", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("birthdays").select("*").eq("family_id", profile.family_id),
      supabase.from("members").select("*").eq("family_id", profile.family_id),
    ]);
    if (notesRes.data) {
      const parsed = (notesRes.data as Record<string, unknown>[]).map((n) => ({
        ...n,
        checklist: Array.isArray(n.checklist) ? n.checklist : [],
        attachments: Array.isArray(n.attachments) ? n.attachments : [],
      })) as Note[];
      setNotes(parsed);

      // Load comment counts
      const noteIds = parsed.map((n) => n.id);
      if (noteIds.length > 0) {
        const { data: countData } = await supabase
          .from("note_comments")
          .select("note_id")
          .in("note_id", noteIds);
        if (countData) {
          const counts: Record<string, number> = {};
          countData.forEach((c: { note_id: string }) => {
            counts[c.note_id] = (counts[c.note_id] || 0) + 1;
          });
          setCommentCounts(counts);
        }
      }
    }
    if (bdayRes.data) setBirthdays(bdayRes.data as Birthday[]);
    if (memRes.data) setMembers(memRes.data as Member[]);
  }, [profile?.family_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Request notification permission
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Realtime notes
  useRealtimeNotes(profile?.family_id, profile?.first_name || "", loadData);

  // --- Filtered notes ---
  const filteredNotes = notes.filter((n) => {
    if (filterCat !== "all" && n.category !== filterCat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.author_name.toLowerCase().includes(q);
    }
    return true;
  });

  // --- Notes CRUD ---
  function openNewNote() {
    setEditingNote(null);
    setNoteTitle("");
    setNoteContent("");
    setNoteCategory("info");
    setNotePinned(false);
    setNoteChecklist([]);
    setNoteAttachments([]);
    setNoteModal(true);
  }

  function openEditNote(n: Note) {
    setEditingNote(n);
    setNoteTitle(n.title);
    setNoteContent(n.content);
    setNoteCategory(n.category);
    setNotePinned(n.pinned);
    setNoteChecklist(n.checklist || []);
    setNoteAttachments(n.attachments || []);
    setNoteModal(true);
  }

  async function openDetailNote(n: Note) {
    setDetailNote(n);
    // Load comments for this note
    const { data } = await supabase
      .from("note_comments")
      .select("*")
      .eq("note_id", n.id)
      .order("created_at", { ascending: true });
    setComments((data as NoteComment[]) || []);
  }

  async function saveNote() {
    if (!profile?.family_id || !noteTitle.trim()) return;
    if (editingNote) {
      await supabase.from("notes").update({
        title: noteTitle.trim(),
        content: noteContent.trim(),
        category: noteCategory,
        pinned: notePinned,
        checklist: noteChecklist,
        attachments: noteAttachments,
        updated_at: new Date().toISOString(),
      }).eq("id", editingNote.id);
    } else {
      await supabase.from("notes").insert({
        family_id: profile.family_id,
        title: noteTitle.trim(),
        content: noteContent.trim(),
        category: noteCategory,
        pinned: notePinned,
        checklist: noteChecklist,
        attachments: noteAttachments,
        author_name: profile.first_name || "",
      });
    }
    setNoteModal(false);
    loadData();
  }

  async function deleteNote(id: string) {
    // Also delete attachments from storage
    const note = notes.find((n) => n.id === id);
    if (note?.attachments?.length) {
      const paths = note.attachments.map((a) => {
        const url = new URL(a.url);
        const parts = url.pathname.split("/note-attachments/");
        return parts[1] || "";
      }).filter(Boolean);
      if (paths.length) {
        await supabase.storage.from("note-attachments").remove(paths);
      }
    }
    await supabase.from("notes").delete().eq("id", id);
    if (detailNote?.id === id) setDetailNote(null);
    loadData();
  }

  // --- Checklist helpers ---
  function addCheckItem() {
    if (!newCheckItem.trim()) return;
    setNoteChecklist([...noteChecklist, { id: genId(), text: newCheckItem.trim(), checked: false }]);
    setNewCheckItem("");
  }

  function toggleCheckItem(itemId: string) {
    setNoteChecklist(noteChecklist.map((i) => i.id === itemId ? { ...i, checked: !i.checked } : i));
  }

  function removeCheckItem(itemId: string) {
    setNoteChecklist(noteChecklist.filter((i) => i.id !== itemId));
  }

  // Toggle checklist item directly on a note (from detail view)
  async function toggleCheckItemOnNote(note: Note, itemId: string) {
    const updated = (note.checklist || []).map((i) =>
      i.id === itemId ? { ...i, checked: !i.checked } : i
    );
    await supabase.from("notes").update({ checklist: updated, updated_at: new Date().toISOString() }).eq("id", note.id);
    setDetailNote({ ...note, checklist: updated });
    loadData();
  }

  // --- Attachments ---
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length || !profile?.family_id) return;
    setUploading(true);
    const newAttachments: Attachment[] = [...noteAttachments];

    for (const file of Array.from(files)) {
      const id = genId();
      const ext = file.name.split(".").pop() || "bin";
      const path = `${profile.family_id}/${id}.${ext}`;
      const { error } = await supabase.storage.from("note-attachments").upload(path, file, { upsert: true });
      if (!error) {
        const { data } = supabase.storage.from("note-attachments").getPublicUrl(path);
        newAttachments.push({
          id,
          url: data.publicUrl,
          name: file.name,
          type: file.type.startsWith("image/") ? "image" : "file",
        });
      }
    }
    setNoteAttachments(newAttachments);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(attId: string) {
    setNoteAttachments(noteAttachments.filter((a) => a.id !== attId));
  }

  // --- Comments ---
  async function addComment() {
    if (!newComment.trim() || !detailNote || !profile?.family_id) return;
    await supabase.from("note_comments").insert({
      note_id: detailNote.id,
      family_id: profile.family_id,
      author_name: profile.first_name || "",
      content: newComment.trim(),
    });
    setNewComment("");
    // Reload comments
    const { data } = await supabase
      .from("note_comments")
      .select("*")
      .eq("note_id", detailNote.id)
      .order("created_at", { ascending: true });
    setComments((data as NoteComment[]) || []);
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

          {/* Search bar */}
          <div className="mb-3">
            <input
              className="w-full px-3 py-2 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              placeholder="🔍 Rechercher une note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Category filters */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            <button
              className="px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all"
              style={{
                background: filterCat === "all" ? "var(--accent)" : "var(--surface2)",
                color: filterCat === "all" ? "#fff" : "var(--dim)",
              }}
              onClick={() => setFilterCat("all")}
            >
              Toutes
            </button>
            {NOTE_CATEGORIES.map((c) => (
              <button
                key={c.value}
                className="px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all"
                style={{
                  background: filterCat === c.value ? `${c.color}20` : "var(--surface2)",
                  color: filterCat === c.value ? c.color : "var(--dim)",
                  border: filterCat === c.value ? `1px solid ${c.color}` : "1px solid transparent",
                }}
                onClick={() => setFilterCat(c.value)}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>

          {filteredNotes.length === 0 && (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">📝</p>
              <p className="text-sm" style={{ color: "var(--dim)" }}>
                {search || filterCat !== "all" ? "Aucun resultat" : "Aucune note pour le moment"}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {filteredNotes.map((n) => {
              const style = getCategoryStyle(n.category);
              const checkDone = (n.checklist || []).filter((i) => i.checked).length;
              const checkTotal = (n.checklist || []).length;
              const attCount = (n.attachments || []).length;
              const commCount = commentCounts[n.id] || 0;
              return (
                <div
                  key={n.id}
                  className="card !mb-0 cursor-pointer"
                  style={{ borderLeft: `3px solid ${style.color}` }}
                  onClick={() => openDetailNote(n)}
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
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                          style={{ background: `${style.color}20`, color: style.color }}
                        >
                          {NOTE_CATEGORIES.find((c) => c.value === n.category)?.label}
                        </span>
                        {checkTotal > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "var(--surface2)", color: checkDone === checkTotal ? "var(--teal)" : "var(--dim)" }}>
                            ✅ {checkDone}/{checkTotal}
                          </span>
                        )}
                        {attCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
                            📎 {attCount}
                          </span>
                        )}
                        {commCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
                            💬 {commCount}
                          </span>
                        )}
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

      {/* Note Detail Modal */}
      <Modal open={!!detailNote} onClose={() => setDetailNote(null)} title={detailNote?.title || ""}>
        {detailNote && (
          <div className="flex flex-col gap-4">
            {/* Category + author */}
            <div className="flex items-center gap-2">
              {(() => {
                const s = getCategoryStyle(detailNote.category);
                return (
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: `${s.color}20`, color: s.color }}>
                    {s.emoji} {NOTE_CATEGORIES.find((c) => c.value === detailNote.category)?.label}
                  </span>
                );
              })()}
              {detailNote.pinned && <span className="text-xs">📌</span>}
              {detailNote.author_name && (
                <span className="text-xs" style={{ color: "var(--faint)" }}>par {detailNote.author_name}</span>
              )}
            </div>

            {/* Content */}
            {detailNote.content && (
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{detailNote.content}</p>
            )}

            {/* Interactive checklist */}
            {detailNote.checklist?.length > 0 && (
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: "var(--dim)" }}>Liste de taches</p>
                <div className="flex flex-col gap-1.5">
                  {detailNote.checklist.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleCheckItemOnNote(detailNote, item.id)}
                        className="rounded"
                      />
                      <span className={`text-sm ${item.checked ? "line-through" : ""}`} style={{ color: item.checked ? "var(--faint)" : "var(--text)" }}>
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments gallery */}
            {detailNote.attachments?.length > 0 && (
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: "var(--dim)" }}>Pieces jointes</p>
                <div className="grid grid-cols-3 gap-2">
                  {detailNote.attachments.map((att) => (
                    <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                      {att.type === "image" ? (
                        <img src={att.url} alt={att.name} className="w-full h-20 object-cover rounded-lg" />
                      ) : (
                        <div className="w-full h-20 rounded-lg flex items-center justify-center text-xs" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
                          📄 {att.name.length > 12 ? att.name.slice(0, 12) + "..." : att.name}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Edit / Delete buttons */}
            <div className="flex gap-2">
              <button
                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => { setDetailNote(null); openEditNote(detailNote); }}
              >
                ✏️ Modifier
              </button>
              <button
                className="py-2.5 px-4 rounded-xl font-bold text-sm"
                style={{ background: "var(--surface2)", color: "var(--red, #ef4444)" }}
                onClick={() => deleteNote(detailNote.id)}
              >
                🗑️
              </button>
            </div>

            {/* Comments section */}
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: "var(--dim)" }}>💬 Commentaires ({comments.length})</p>
              {comments.length === 0 && (
                <p className="text-xs mb-2" style={{ color: "var(--faint)" }}>Aucun commentaire</p>
              )}
              <div className="flex flex-col gap-2 mb-3 max-h-48 overflow-y-auto">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-xl px-3 py-2" style={{ background: "var(--surface2)" }}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold">{c.author_name || "Anonyme"}</span>
                      <span className="text-[10px]" style={{ color: "var(--faint)" }}>
                        {new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: "var(--text)" }}>{c.content}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-xl text-sm"
                  style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
                  placeholder="Ajouter un commentaire..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addComment(); }}
                />
                <button
                  className="px-3 py-2 rounded-xl text-sm font-bold"
                  style={{ background: "var(--accent)", color: "#fff" }}
                  onClick={addComment}
                >
                  Envoyer
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Note Edit Modal */}
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

          {/* Checklist section */}
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>✅ Liste de taches</label>
            <div className="flex flex-col gap-1.5 mb-2">
              {noteChecklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleCheckItem(item.id)}
                    className="rounded"
                  />
                  <span className={`text-sm flex-1 ${item.checked ? "line-through" : ""}`} style={{ color: item.checked ? "var(--faint)" : "var(--text)" }}>
                    {item.text}
                  </span>
                  <button
                    className="text-xs p-1"
                    style={{ color: "var(--red, #ef4444)" }}
                    onClick={() => removeCheckItem(item.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-xl text-sm"
                style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                placeholder="Ajouter un element..."
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCheckItem(); } }}
              />
              <button
                className="px-3 py-2 rounded-xl text-xs font-bold"
                style={{ background: "var(--surface2)", color: "var(--accent)" }}
                onClick={addCheckItem}
              >
                + Ajouter
              </button>
            </div>
          </div>

          {/* Attachments section */}
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>📎 Pieces jointes</label>
            {noteAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {noteAttachments.map((att) => (
                  <div key={att.id} className="relative">
                    {att.type === "image" ? (
                      <img src={att.url} alt={att.name} className="w-16 h-16 object-cover rounded-lg" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center text-[10px] text-center" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
                        📄 {att.name.length > 8 ? att.name.slice(0, 8) + "..." : att.name}
                      </div>
                    )}
                    <button
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                      style={{ background: "var(--red, #ef4444)", color: "#fff" }}
                      onClick={() => removeAttachment(att.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.txt"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              className="w-full py-2 rounded-xl text-xs font-bold"
              style={{ background: "var(--surface2)", color: "var(--accent)", border: "1px dashed var(--glass-border)" }}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Upload en cours..." : "📷 Ajouter une image ou un fichier"}
            </button>
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
