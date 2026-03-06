"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import { useRealtimeNotes, useRealtimeShopping, useRealtimeExpenses, useRealtimeChores, useRealtimeBirthdays } from "@/lib/realtime";
import PhotoAlbum from "@/components/PhotoAlbum";
import Modal from "@/components/Modal";
import { SHOPPING_CATEGORIES, detectShoppingCategory } from "@/lib/shopping-categories";
import { useToast } from "@/components/Toast";
import { notifyFamily } from "@/lib/push";
import { usePullToRefresh, PullIndicator } from "@/lib/usePullToRefresh";
import EmptyState from "@/components/EmptyState";
import type { Note, Birthday, Member, NoteComment, ChecklistItem, Attachment, ShoppingItem, Expense, Chore, FamilyPhoto } from "@/lib/types";

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
  const { profile, setVieUnread } = useProfile();
  const { toast, toastUndo } = useToast();
  const { pullDistance, refreshing } = usePullToRefresh(() => loadData());
  const searchParams = useSearchParams();
  const validTabs = ["notes", "anniversaires", "courses", "budget", "taches", "photos"] as const;
  type Tab = typeof validTabs[number];
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t && validTabs.includes(t as Tab)) return t as Tab;
    }
    return "notes";
  });

  // Sync tab when URL query param changes (e.g. navigating from another page)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && validTabs.includes(t as Tab)) setTab(t as Tab);
  }, [searchParams]);

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
  const [noteVisibleTo, setNoteVisibleTo] = useState<string[] | null>(null);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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

  // Shopping state
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [newShoppingText, setNewShoppingText] = useState("");
  const [shoppingCat, setShoppingCat] = useState("all");

  // Budget state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseModal, setExpenseModal] = useState(false);
  const [expAmount, setExpAmount] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expCategory, setExpCategory] = useState("autre");
  const [expMember, setExpMember] = useState("");
  const [expDate, setExpDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Chores state
  const [chores, setChores] = useState<Chore[]>([]);
  const [choreModal, setChoreModal] = useState(false);
  const [choreName, setChoreName] = useState("");
  const [choreEmoji, setChoreEmoji] = useState("🧹");
  const [choreFreq, setChoreFreq] = useState<"daily" | "weekly">("weekly");
  const [choreMembers, setChoreMembers] = useState<string[]>([]);

  // Photos state
  const [photos, setPhotos] = useState<FamilyPhoto[]>([]);

  // Comment counts per note
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataLoadedRef = useRef(false);

  // --- Badge "nouveautés" helpers ---
  const TAB_KEYS = ["notes", "anniversaires", "courses", "budget", "taches", "photos"] as const;

  function getLastSeen(t: string): string {
    return localStorage.getItem(`flowtime_vie_lastSeen_${t}`) || "1970-01-01T00:00:00.000Z";
  }

  function markSeen(t: string) {
    localStorage.setItem(`flowtime_vie_lastSeen_${t}`, new Date().toISOString());
  }

  // Compute new item counts per tab
  const newCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const dataMap: Record<string, { created_at: string }[]> = {
      notes, anniversaires: birthdays, courses: shoppingItems,
      budget: expenses, taches: chores, photos,
    };
    for (const key of TAB_KEYS) {
      const lastSeen = getLastSeen(key);
      counts[key] = (dataMap[key] || []).filter((item) => item.created_at > lastSeen).length;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, birthdays, shoppingItems, expenses, chores, photos]);

  // Mark the active tab as seen once data loads & propagate total to Navbar
  useEffect(() => {
    const hasData = notes.length || birthdays.length || shoppingItems.length || expenses.length || chores.length || photos.length;
    if (hasData && !dataLoadedRef.current) {
      dataLoadedRef.current = true;
      markSeen(tab);
    }
  }, [notes, birthdays, shoppingItems, expenses, chores, photos, tab]);

  // Propagate total unread to Navbar via layout context
  useEffect(() => {
    const total = TAB_KEYS.reduce((sum, key) => sum + (key === tab ? 0 : (newCounts[key] || 0)), 0);
    setVieUnread(total);
  }, [newCounts, tab, setVieUnread]);

  // Reset unread when leaving the page
  useEffect(() => {
    return () => setVieUnread(0);
  }, [setVieUnread]);

  const loadData = useCallback(async () => {
    if (!profile?.family_id) return;
    const [notesRes, bdayRes, memRes, shopRes, expRes, choreRes, photoRes] = await Promise.all([
      supabase.from("notes").select("*").eq("family_id", profile.family_id).order("pinned", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("birthdays").select("*").eq("family_id", profile.family_id),
      supabase.from("members").select("*").eq("family_id", profile.family_id),
      supabase.from("shopping_items").select("*").eq("family_id", profile.family_id).order("created_at", { ascending: false }),
      supabase.from("expenses").select("*").eq("family_id", profile.family_id).order("date", { ascending: false }),
      supabase.from("chores").select("*").eq("family_id", profile.family_id).order("created_at", { ascending: false }),
      supabase.from("family_photos").select("*").eq("family_id", profile.family_id).order("created_at", { ascending: false }),
    ]);
    if (notesRes.data) {
      const parsed = (notesRes.data as Record<string, unknown>[]).map((n) => ({
        ...n,
        checklist: Array.isArray(n.checklist) ? n.checklist : [],
        attachments: Array.isArray(n.attachments) ? n.attachments : [],
        visible_to: Array.isArray(n.visible_to) ? n.visible_to : null,
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
    const loadedBdays = (bdayRes.data || []) as Birthday[];
    const loadedMembers = (memRes.data || []) as Member[];
    // Sync: auto-create birthdays for members with birth_date not yet in birthdays
    const membersToSync = loadedMembers.filter(
      (m) => m.birth_date && !loadedBdays.some((b) => b.member_id === m.id)
    );
    if (membersToSync.length > 0) {
      const inserts = membersToSync.map((m) => ({
        family_id: profile.family_id,
        name: m.name,
        date: m.birth_date!,
        emoji: m.emoji || "🎂",
        member_id: m.id,
      }));
      const { data: newBdays } = await supabase.from("birthdays").insert(inserts).select("*");
      if (newBdays) loadedBdays.push(...(newBdays as Birthday[]));
    }
    // Sync: update existing linked birthdays if member name/date/emoji changed
    for (const b of loadedBdays) {
      if (!b.member_id) continue;
      const m = loadedMembers.find((mem) => mem.id === b.member_id);
      if (!m || !m.birth_date) continue;
      if (b.name !== m.name || b.date !== m.birth_date || b.emoji !== m.emoji) {
        await supabase.from("birthdays").update({ name: m.name, date: m.birth_date, emoji: m.emoji }).eq("id", b.id);
        b.name = m.name;
        b.date = m.birth_date;
        b.emoji = m.emoji;
      }
    }
    setBirthdays(loadedBdays);
    setMembers(loadedMembers);
    if (shopRes.data) setShoppingItems(shopRes.data as ShoppingItem[]);
    if (expRes.data) setExpenses(expRes.data as Expense[]);
    if (choreRes.data) setChores(choreRes.data as Chore[]);
    if (photoRes.data) setPhotos(photoRes.data as FamilyPhoto[]);
  }, [profile?.family_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Request notification permission
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Realtime subscriptions
  useRealtimeNotes(profile?.family_id, profile?.first_name || "", loadData);
  useRealtimeShopping(profile?.family_id, loadData);
  useRealtimeExpenses(profile?.family_id, loadData);
  useRealtimeChores(profile?.family_id, loadData);
  useRealtimeBirthdays(profile?.family_id, loadData);

  // Polling fallback: refresh every 10s
  useEffect(() => {
    if (!profile?.family_id) return;
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [profile?.family_id, loadData]);

  // --- Filtered notes ---
  const myMember = members.find((m) => m.name.toLowerCase() === (profile?.first_name || "").toLowerCase());

  const filteredNotes = notes.filter((n) => {
    // Visibility: if visible_to is set, only show to listed members
    if (n.visible_to && n.visible_to.length > 0 && myMember) {
      if (!n.visible_to.includes(myMember.id) && n.author_name.toLowerCase() !== (profile?.first_name || "").toLowerCase()) {
        return false;
      }
    }
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
    setNoteVisibleTo(null);
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
    setNoteVisibleTo(n.visible_to || null);
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
        visible_to: noteVisibleTo && noteVisibleTo.length > 0 ? noteVisibleTo : null,
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
        visible_to: noteVisibleTo && noteVisibleTo.length > 0 ? noteVisibleTo : null,
        author_name: profile.first_name || "",
      });
      notifyFamily("FlowTime 📝", `${profile.first_name || "Quelqu'un"} a ajouté une note : ${noteTitle.trim()}`);
    }
    setNoteModal(false);
    loadData();
  }

  async function deleteNote(id: string) {
    const note = notes.find((n) => n.id === id);
    // Delete attachments from storage
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
    if (note) {
      toastUndo(`"${note.title}" supprimée`, async () => {
        const { id: _id, ...rest } = note as unknown as Record<string, unknown>;
        void _id;
        await supabase.from("notes").insert(rest);
        loadData();
      });
    }
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
    notifyFamily("FlowTime 💬", `${profile.first_name || "Quelqu'un"} a commenté : ${detailNote.title}`);
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
      notifyFamily("FlowTime 🎂", `${profile.first_name || "Quelqu'un"} a ajouté l'anniversaire de ${bdayName.trim()}`);
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
    <div className="px-4 py-4 animate-in gradient-bg" style={{ paddingBottom: 80 }}>
      <PullIndicator pullDistance={pullDistance} refreshing={refreshing} />
      <h1 className="text-xl font-bold mb-4">Vie de famille</h1>

      {/* Tab switcher */}
      <div data-tutorial="vie-tabs" className="flex gap-1 mb-5 overflow-x-auto overflow-y-visible pb-1 pt-2">
        {([
          ["notes", "📝", "Notes"],
          ["anniversaires", "🎂", "Anniv."],
          ["courses", "🛒", "Courses"],
          ["budget", "💰", "Budget"],
          ["taches", "🧹", "Tâches"],
          ["photos", "📸", "Photos"],
        ] as const).map(([key, emoji, label]) => (
          <button
            key={key}
            className="px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all shrink-0 relative"
            style={{
              background: tab === key ? "var(--accent)" : "var(--surface2)",
              color: tab === key ? "#fff" : "var(--dim)",
              boxShadow: tab === key ? "0 4px 16px var(--accent-glow)" : "none",
            }}
            onClick={() => { setTab(key); markSeen(key); }}
          >
            {emoji} {label}
            {tab !== key && (newCounts[key] || 0) > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: "var(--red, #ef4444)" }}>
                {newCounts[key] > 9 ? "9+" : newCounts[key]}
              </span>
            )}
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
                {search || filterCat !== "all" ? "Aucun résultat" : "Aucune note pour le moment"}
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
                        {n.visible_to && n.visible_to.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
                            🔒 {n.visible_to.length} membre{n.visible_to.length > 1 ? "s" : ""}
                          </span>
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

      {/* Courses tab */}
      {tab === "courses" && (() => {
        const unchecked = shoppingItems.filter((i) => !i.checked);
        const checked = shoppingItems.filter((i) => i.checked);

        async function addShoppingItem() {
          if (!newShoppingText.trim() || !profile?.family_id) return;
          const detectedCat = detectShoppingCategory(newShoppingText.trim());
          await supabase.from("shopping_items").insert({
            family_id: profile.family_id,
            name: newShoppingText.trim(),
            category: detectedCat,
            added_by: profile.first_name || "",
          });
          notifyFamily("FlowTime 🛒", `${profile.first_name || "Quelqu'un"} a ajouté "${newShoppingText.trim()}" aux courses`);
          setNewShoppingText("");
          loadData();
        }

        const filteredUnchecked = shoppingCat === "all" ? unchecked : unchecked.filter((i) => i.category === shoppingCat);
        const filteredChecked = shoppingCat === "all" ? checked : checked.filter((i) => i.category === shoppingCat);

        async function toggleShoppingItem(item: ShoppingItem) {
          await supabase.from("shopping_items").update({ checked: !item.checked }).eq("id", item.id);
          loadData();
        }

        async function deleteShoppingItem(id: string) {
          await supabase.from("shopping_items").delete().eq("id", id);
          loadData();
        }

        async function clearChecked() {
          if (!confirm("Vider les articles coches ?")) return;
          for (const item of checked) {
            await supabase.from("shopping_items").delete().eq("id", item.id);
          }
          loadData();
        }

        return (
          <div>
            <p className="label">Liste de courses</p>

            {/* Add item input */}
            <div className="flex gap-2 mb-3">
              <input
                className="flex-1 px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
                value={newShoppingText}
                onChange={(e) => setNewShoppingText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addShoppingItem(); }}
                placeholder="Ajouter un article..."
              />
              <button
                className="px-4 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={addShoppingItem}
              >
                +
              </button>
            </div>

            {/* Category filter chips */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              <button
                className="px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0"
                style={{
                  background: shoppingCat === "all" ? "var(--accent)" : "var(--surface2)",
                  color: shoppingCat === "all" ? "#fff" : "var(--dim)",
                }}
                onClick={() => setShoppingCat("all")}
              >
                Tout
              </button>
              {SHOPPING_CATEGORIES.map((cat) => {
                const count = unchecked.filter((i) => i.category === cat.value).length;
                if (count === 0 && shoppingCat !== cat.value) return null;
                return (
                  <button
                    key={cat.value}
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0"
                    style={{
                      background: shoppingCat === cat.value ? "var(--accent)" : "var(--surface2)",
                      color: shoppingCat === cat.value ? "#fff" : "var(--dim)",
                    }}
                    onClick={() => setShoppingCat(cat.value)}
                  >
                    {cat.emoji} {cat.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Unchecked items */}
            {unchecked.length === 0 && checked.length === 0 && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">🛒</p>
                <p className="text-sm" style={{ color: "var(--dim)" }}>Liste de courses vide</p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {filteredUnchecked.map((item) => {
                const cat = SHOPPING_CATEGORIES.find((c) => c.value === item.category);
                return (
                  <div key={item.id} className="card !mb-0 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => toggleShoppingItem(item)}
                      className="rounded w-5 h-5 shrink-0"
                    />
                    {cat && <span className="text-sm shrink-0">{cat.emoji}</span>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold">{item.name}</p>
                    </div>
                    {item.added_by && (
                      <span className="text-[10px] shrink-0" style={{ color: "var(--faint)" }}>{item.added_by}</span>
                    )}
                    <button
                      className="text-xs p-1 shrink-0"
                      style={{ color: "var(--red, #ef4444)" }}
                      onClick={() => deleteShoppingItem(item.id)}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Checked items */}
            {filteredChecked.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold" style={{ color: "var(--dim)" }}>Coches ({filteredChecked.length})</p>
                  <button
                    className="text-[10px] font-bold px-2 py-1 rounded-full"
                    style={{ background: "var(--surface2)", color: "var(--red, #ef4444)" }}
                    onClick={clearChecked}
                  >
                    Vider les coches
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {filteredChecked.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: "var(--surface2)", opacity: 0.5 }}>
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={() => toggleShoppingItem(item)}
                        className="rounded w-5 h-5 shrink-0"
                      />
                      <span className="text-sm line-through flex-1">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Budget tab */}
      {tab === "budget" && (() => {
        const EXPENSE_CATS = [
          { value: "courses", label: "Courses", emoji: "🛒" },
          { value: "sante", label: "Santé", emoji: "🏥" },
          { value: "loisir", label: "Loisir", emoji: "🎬" },
          { value: "transport", label: "Transport", emoji: "🚗" },
          { value: "education", label: "Éducation", emoji: "📚" },
          { value: "maison", label: "Maison", emoji: "🏠" },
          { value: "autre", label: "Autre", emoji: "📦" },
        ];

        const now = new Date();
        const monthExpenses = expenses.filter((e) => {
          const d = new Date(e.date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        const monthTotal = monthExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

        // Totals by category
        const byCat: Record<string, number> = {};
        for (const e of monthExpenses) {
          byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
        }

        async function addExpense() {
          if (!profile?.family_id || !expAmount || !expDesc.trim()) return;
          await supabase.from("expenses").insert({
            family_id: profile.family_id,
            amount: parseFloat(expAmount),
            description: expDesc.trim(),
            category: expCategory,
            member_id: expMember || null,
            date: expDate,
          });
          notifyFamily("FlowTime 💰", `${profile.first_name || "Quelqu'un"} a ajouté une dépense : ${expDesc.trim()} (${expAmount}€)`);
          setExpenseModal(false);
          setExpAmount("");
          setExpDesc("");
          setExpCategory("autre");
          setExpMember("");
          loadData();
        }

        async function deleteExpense(id: string) {
          await supabase.from("expenses").delete().eq("id", id);
          loadData();
        }

        return (
          <div>
            {/* Month total */}
            <div className="card text-center !mb-3">
              <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Total du mois</p>
              <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{monthTotal.toFixed(2)} €</p>
            </div>

            {/* Category breakdown */}
            {Object.keys(byCat).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([cat, total]) => {
                  const catInfo = EXPENSE_CATS.find((c) => c.value === cat);
                  return (
                    <span key={cat} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "var(--surface2)" }}>
                      {catInfo?.emoji} {catInfo?.label}: {total.toFixed(0)}€
                    </span>
                  );
                })}
              </div>
            )}

            {/* Expense splitting - qui doit combien */}
            {monthExpenses.length > 0 && members.length > 1 && (() => {
              const perMember: Record<string, number> = {};
              for (const m of members) perMember[m.id] = 0;
              for (const exp of monthExpenses) {
                if (exp.member_id && perMember[exp.member_id] !== undefined) {
                  perMember[exp.member_id] += Number(exp.amount);
                }
              }
              const activeMembers = members.filter((m) => perMember[m.id] > 0);
              if (activeMembers.length < 2) return null;
              const fairShare = monthTotal / activeMembers.length;
              const balances = activeMembers.map((m) => ({
                ...m,
                paid: perMember[m.id],
                balance: perMember[m.id] - fairShare,
              }));
              // Calculate transfers
              const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ ...b, balance: -b.balance }));
              const creditors = balances.filter((b) => b.balance > 0).map((b) => ({ ...b }));
              const transfers: { from: string; to: string; amount: number }[] = [];
              let di = 0, ci = 0;
              while (di < debtors.length && ci < creditors.length) {
                const amount = Math.min(debtors[di].balance, creditors[ci].balance);
                if (amount > 0.01) {
                  transfers.push({ from: debtors[di].name, to: creditors[ci].name, amount });
                }
                debtors[di].balance -= amount;
                creditors[ci].balance -= amount;
                if (debtors[di].balance < 0.01) di++;
                if (creditors[ci].balance < 0.01) ci++;
              }
              return (
                <div className="card !mb-3">
                  <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--dim)" }}>Répartition</p>
                  <div className="flex flex-col gap-1.5 mb-2">
                    {balances.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-xs">
                        <span>{b.emoji} {b.name}</span>
                        <div className="flex items-center gap-2">
                          <span style={{ color: "var(--dim)" }}>{b.paid.toFixed(0)}€ payé</span>
                          <span className="font-bold" style={{ color: b.balance >= 0 ? "var(--green)" : "var(--red)" }}>
                            {b.balance >= 0 ? "+" : ""}{b.balance.toFixed(2)}€
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {transfers.length > 0 && (
                    <>
                      <div className="h-px mb-2" style={{ background: "var(--glass-border)" }} />
                      <div className="flex flex-col gap-1">
                        {transfers.map((t, i) => (
                          <p key={i} className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                            {t.from} → {t.to} : {t.amount.toFixed(2)}€
                          </p>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            <button
              className="btn btn-primary mb-4 text-sm"
              onClick={() => setExpenseModal(true)}
            >
              + Ajouter une dépense
            </button>

            {/* Expenses list */}
            {monthExpenses.length === 0 && (
              <EmptyState icon="💰" title="Aucune dépense ce mois" subtitle="Ajoute une dépense pour commencer" />
            )}
            <div className="flex flex-col gap-1.5">
              {monthExpenses.map((exp) => {
                const catInfo = EXPENSE_CATS.find((c) => c.value === exp.category);
                const mem = members.find((m) => m.id === exp.member_id);
                return (
                  <div key={exp.id} className="card !mb-0 flex items-center gap-3">
                    <span className="text-lg">{catInfo?.emoji || "📦"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{exp.description}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px]" style={{ color: "var(--dim)" }}>{new Date(exp.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                        {mem && <span className="text-[10px]" style={{ color: "var(--dim)" }}>{mem.emoji} {mem.name}</span>}
                      </div>
                    </div>
                    <span className="text-sm font-bold" style={{ color: "var(--red)" }}>-{Number(exp.amount).toFixed(2)}€</span>
                    <button className="text-xs p-1" style={{ color: "var(--red)" }} onClick={() => deleteExpense(exp.id)}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Expense Modal */}
      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="Nouvelle dépense">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Montant (€)</label>
            <input type="number" step="0.01" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }} value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Description</label>
            <input className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }} value={expDesc} onChange={(e) => setExpDesc(e.target.value)} placeholder="Courses, restaurant..." />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Categorie</label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: "courses", emoji: "🛒" }, { value: "sante", emoji: "🏥" },
                { value: "loisir", emoji: "🎬" }, { value: "transport", emoji: "🚗" },
                { value: "education", emoji: "📚" }, { value: "maison", emoji: "🏠" },
                { value: "autre", emoji: "📦" },
              ].map((c) => (
                <button key={c.value} className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold" style={{ background: expCategory === c.value ? "var(--accent-soft)" : "var(--surface2)", color: expCategory === c.value ? "var(--accent)" : "var(--dim)", border: expCategory === c.value ? "1px solid var(--accent)" : "1px solid transparent" }} onClick={() => setExpCategory(c.value)}>
                  {c.emoji} {c.value}
                </button>
              ))}
            </div>
          </div>
          {members.length > 0 && (
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Membre</label>
              <select className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }} value={expMember} onChange={(e) => setExpMember(e.target.value)}>
                <option value="">Aucun</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Date</label>
            <input type="date" className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }} value={expDate} onChange={(e) => setExpDate(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => { const addExpense = async () => { if (!profile?.family_id || !expAmount || !expDesc.trim()) return; await supabase.from("expenses").insert({ family_id: profile.family_id, amount: parseFloat(expAmount), description: expDesc.trim(), category: expCategory, member_id: expMember || null, date: expDate }); notifyFamily("FlowTime 💰", `${profile.first_name || "Quelqu'un"} a ajouté une dépense : ${expDesc.trim()} (${expAmount}€)`); setExpenseModal(false); setExpAmount(""); setExpDesc(""); setExpCategory("autre"); setExpMember(""); loadData(); }; addExpense(); }}>
            Ajouter
          </button>
        </div>
      </Modal>

      {/* Chores tab */}
      {tab === "taches" && (() => {
        const CHORE_EMOJIS = ["🧹", "🧺", "🍽️", "🗑️", "🛒", "🐕", "🌱", "🚗", "📚"];

        async function addChore() {
          if (!profile?.family_id || !choreName.trim()) return;
          await supabase.from("chores").insert({
            family_id: profile.family_id,
            name: choreName.trim(),
            emoji: choreEmoji,
            frequency: choreFreq,
            assigned_members: choreMembers,
            current_index: 0,
            last_rotated: new Date().toISOString().split("T")[0],
          });
          notifyFamily("FlowTime 🧹", `${profile.first_name || "Quelqu'un"} a ajouté une tâche : ${choreEmoji} ${choreName.trim()}`);
          setChoreModal(false);
          setChoreName("");
          setChoreEmoji("🧹");
          setChoreMembers([]);
          loadData();
        }

        async function deleteChore(id: string) {
          await supabase.from("chores").delete().eq("id", id);
          loadData();
        }

        async function rotateChore(chore: Chore) {
          const nextIndex = (chore.current_index + 1) % (chore.assigned_members.length || 1);
          await supabase.from("chores").update({
            current_index: nextIndex,
            last_rotated: new Date().toISOString().split("T")[0],
          }).eq("id", chore.id);
          loadData();
        }

        // Auto-rotate check
        for (const chore of chores) {
          if (chore.assigned_members.length < 2) continue;
          const lastRotated = chore.last_rotated ? new Date(chore.last_rotated) : new Date(0);
          const now = new Date();
          const daysSince = Math.floor((now.getTime() - lastRotated.getTime()) / 86400000);
          const shouldRotate = chore.frequency === "daily" ? daysSince >= 1 : daysSince >= 7;
          if (shouldRotate && chore.last_rotated) {
            rotateChore(chore);
          }
        }

        return (
          <div>
            <button className="btn btn-primary mb-4 text-sm" onClick={() => setChoreModal(true)}>
              + Ajouter une tache
            </button>

            {chores.length === 0 && (
              <div className="text-center py-8">
                <p className="text-3xl mb-2">🧹</p>
                <p className="text-sm" style={{ color: "var(--dim)" }}>Aucune tâche ménagère</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {chores.map((chore) => {
                const currentMemberId = chore.assigned_members[chore.current_index];
                const currentMember = members.find((m) => m.id === currentMemberId);
                return (
                  <div key={chore.id} className="card !mb-0">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{chore.emoji}</span>
                      <div className="flex-1">
                        <p className="text-sm font-bold">{chore.name}</p>
                        <p className="text-[10px]" style={{ color: "var(--dim)" }}>
                          {chore.frequency === "daily" ? "Quotidien" : "Hebdomadaire"}
                        </p>
                      </div>
                      {currentMember && (
                        <div className="text-center">
                          <span className="text-lg">{currentMember.emoji}</span>
                          <p className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>{currentMember.name}</p>
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <button className="text-xs p-1 rounded" style={{ background: "var(--surface2)" }} onClick={() => rotateChore(chore)} title="Rotation">🔄</button>
                        <button className="text-xs p-1" style={{ color: "var(--red)" }} onClick={() => deleteChore(chore.id)}>✕</button>
                      </div>
                    </div>
                    {/* Rotation preview */}
                    {chore.assigned_members.length > 1 && (
                      <div className="flex items-center gap-1 mt-2 pl-10">
                        {chore.assigned_members.map((mId, i) => {
                          const m = members.find((mem) => mem.id === mId);
                          return (
                            <span key={mId} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: i === chore.current_index ? "var(--accent-soft)" : "var(--surface2)", color: i === chore.current_index ? "var(--accent)" : "var(--dim)", fontWeight: i === chore.current_index ? 700 : 400 }}>
                              {m?.emoji} {m?.name?.split(" ")[0]}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Chore Modal */}
      <Modal open={choreModal} onClose={() => setChoreModal(false)} title="Nouvelle tache">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Nom</label>
            <input className="w-full px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }} value={choreName} onChange={(e) => setChoreName(e.target.value)} placeholder="Vaisselle, aspirateur..." />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Emoji</label>
            <div className="flex gap-2 flex-wrap">
              {["🧹", "🧺", "🍽️", "🗑️", "🛒", "🐕", "🌱", "🚗", "📚"].map((e) => (
                <button key={e} className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: choreEmoji === e ? "var(--accent-soft)" : "var(--surface2)", border: choreEmoji === e ? "1px solid var(--accent)" : "1px solid transparent" }} onClick={() => setChoreEmoji(e)}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Frequence</label>
            <div className="flex gap-2">
              {([["daily", "Quotidien"], ["weekly", "Hebdomadaire"]] as const).map(([key, label]) => (
                <button key={key} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: choreFreq === key ? "var(--accent)" : "var(--surface2)", color: choreFreq === key ? "#fff" : "var(--dim)" }} onClick={() => setChoreFreq(key)}>{label}</button>
              ))}
            </div>
          </div>
          {members.length > 0 && (
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Participants (rotation)</label>
              <div className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const sel = choreMembers.includes(m.id);
                  return (
                    <button key={m.id} className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: sel ? "var(--accent-soft)" : "var(--surface2)", color: sel ? "var(--accent)" : "var(--dim)", border: sel ? "1px solid var(--accent)" : "1px solid transparent" }} onClick={() => setChoreMembers(sel ? choreMembers.filter((id) => id !== m.id) : [...choreMembers, m.id])}>
                      {m.emoji} {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <button className="btn btn-primary" onClick={() => { const addChore = async () => { if (!profile?.family_id || !choreName.trim()) return; await supabase.from("chores").insert({ family_id: profile.family_id, name: choreName.trim(), emoji: choreEmoji, frequency: choreFreq, assigned_members: choreMembers, current_index: 0, last_rotated: new Date().toISOString().split("T")[0] }); notifyFamily("FlowTime 🧹", `${profile.first_name || "Quelqu'un"} a ajouté une tâche : ${choreEmoji} ${choreName.trim()}`); setChoreModal(false); setChoreName(""); setChoreEmoji("🧹"); setChoreMembers([]); loadData(); }; addChore(); }}>
            Ajouter
          </button>
        </div>
      </Modal>

      {/* Photos tab */}
      {tab === "photos" && (
        <PhotoAlbum
          photos={photos}
          familyId={profile?.family_id || ""}
          userName={profile?.first_name || ""}
          onUpdate={loadData}
        />
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
                    att.type === "image" ? (
                      <button key={att.id} className="block w-full" onClick={() => setPreviewImage(att.url)}>
                        <img src={att.url} alt={att.name} className="w-full h-20 object-cover rounded-lg" />
                      </button>
                    ) : (
                      <a key={att.id} href={att.url} target="_blank" rel="noopener noreferrer" className="block">
                        <div className="w-full h-20 rounded-lg flex items-center justify-center text-xs" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
                          📄 {att.name.length > 12 ? att.name.slice(0, 12) + "..." : att.name}
                        </div>
                      </a>
                    )
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

          {/* Visibility / access control */}
          {members.length > 0 && (
            <div>
              <label className="text-xs font-bold block mb-2" style={{ color: "var(--dim)" }}>👁️ Qui peut voir cette note ?</label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: !noteVisibleTo ? "var(--accent-soft)" : "var(--surface2)",
                    color: !noteVisibleTo ? "var(--accent)" : "var(--dim)",
                    border: !noteVisibleTo ? "1px solid var(--accent)" : "1px solid transparent",
                  }}
                  onClick={() => setNoteVisibleTo(null)}
                >
                  👨‍👩‍👧‍👦 Toute la famille
                </button>
                {members.map((m) => {
                  const selected = noteVisibleTo?.includes(m.id) || false;
                  return (
                    <button
                      key={m.id}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                      style={{
                        background: selected ? "var(--accent-soft)" : "var(--surface2)",
                        color: selected ? "var(--accent)" : "var(--dim)",
                        border: selected ? "1px solid var(--accent)" : "1px solid transparent",
                      }}
                      onClick={() => {
                        if (!noteVisibleTo) {
                          // Switching from "all" to specific selection
                          setNoteVisibleTo([m.id]);
                        } else if (selected) {
                          const next = noteVisibleTo.filter((id) => id !== m.id);
                          setNoteVisibleTo(next.length > 0 ? next : null);
                        } else {
                          setNoteVisibleTo([...noteVisibleTo, m.id]);
                        }
                      }}
                    >
                      {m.emoji} {m.name}
                    </button>
                  );
                })}
              </div>
              {noteVisibleTo && noteVisibleTo.length > 0 && (
                <p className="text-[10px] mt-1" style={{ color: "var(--dim)" }}>
                  🔒 Seuls les membres selectionnes verront cette note
                </p>
              )}
            </div>
          )}

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

      {/* Fullscreen image viewer */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[800] flex flex-col"
          style={{ background: "rgba(0,0,0,0.95)", maxWidth: 430, margin: "0 auto" }}
          onClick={() => setPreviewImage(null)}
        >
          <div className="flex justify-end" style={{ padding: "max(16px, env(safe-area-inset-top, 16px)) 16px 8px 16px" }}>
            <button
              className="w-9 h-9 flex items-center justify-center rounded-full text-white text-lg"
              style={{ background: "rgba(255,255,255,0.15)" }}
              onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="Preview"
              className="max-w-full max-h-[70vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
