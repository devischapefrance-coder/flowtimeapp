"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
import { useProfile } from "../layout";
import { useRealtimeNotes, useRealtimeShopping, useRealtimeChores, useRealtimeBirthdays } from "@/lib/realtime";
import Modal from "@/components/Modal";
import { SHOPPING_CATEGORIES, detectShoppingCategory } from "@/lib/shopping-categories";
import { useToast } from "@/components/Toast";
import { notifyFamily } from "@/lib/push";
import { usePullToRefresh, PullIndicator } from "@/lib/usePullToRefresh";
import EmptyState from "@/components/EmptyState";
import type { Note, Birthday, Member, NoteComment, ChecklistItem, Attachment, ShoppingItem, Chore } from "@/lib/types";

const NOTE_CATEGORIES = [
  { value: "info", label: "Info", color: "var(--teal)", emoji: "💡" },
  { value: "important", label: "Important", color: "var(--red, #ef4444)", emoji: "🔴" },
  { value: "rappel", label: "Code d'usage", color: "var(--warm, #f59e0b)", emoji: "📋" },
] as const;

function getCategoryStyle(cat: string) {
  const c = NOTE_CATEGORIES.find((n) => n.value === cat);
  return { color: c?.color || "var(--teal)", emoji: c?.emoji || "💡" };
}


function genId() {
  return crypto.randomUUID();
}

// ---- Document types ----
interface FamilyDocument {
  id: string;
  type: string;
  label: string;
  emoji: string;
  memberId: string;
  memberName: string;
  note: string;
  images: string[]; // base64 data URLs
  createdAt: string;
}

const DOC_TYPES = [
  { type: "carte_vitale", label: "Carte Vitale", emoji: "💚" },
  { type: "carte_id", label: "Carte d'identité", emoji: "🪪" },
  { type: "passeport", label: "Passeport", emoji: "🛂" },
  { type: "mutuelle", label: "Carte mutuelle", emoji: "🏥" },
  { type: "assurance_scolaire", label: "Assurance scolaire", emoji: "🎒" },
  { type: "carnet_sante", label: "Carnet de santé", emoji: "📗" },
  { type: "carnet_vaccination", label: "Carnet de vaccination", emoji: "💉" },
  { type: "permis", label: "Permis de conduire", emoji: "🚗" },
  { type: "carte_grise", label: "Carte grise", emoji: "📋" },
  { type: "assurance_auto", label: "Assurance auto", emoji: "🚙" },
  { type: "assurance_habitation", label: "Assurance habitation", emoji: "🏠" },
  { type: "attestation", label: "Attestation", emoji: "📜" },
  { type: "ordonnance", label: "Ordonnance", emoji: "💊" },
  { type: "autre", label: "Autre document", emoji: "📄" },
];

function DocumentsTab({ members, familyId }: { members: Member[]; familyId: string }) {
  const STORAGE_KEY = `flowtime_docs_${familyId}`;

  function loadDocs(): FamilyDocument[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveDocs(docs: FamilyDocument[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  }

  const [docs, setDocs] = useState<FamilyDocument[]>(() => loadDocs());
  const [addOpen, setAddOpen] = useState(false);
  const [viewDoc, setViewDoc] = useState<FamilyDocument | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [filterMember, setFilterMember] = useState("all");

  // Add form state
  const [addType, setAddType] = useState("carte_vitale");
  const [addMember, setAddMember] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addImages, setAddImages] = useState<string[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          setAddImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function addDoc() {
    if (!addMember) return;
    const member = members.find((m) => m.id === addMember);
    const docType = DOC_TYPES.find((d) => d.type === addType) || DOC_TYPES[DOC_TYPES.length - 1];
    const newDoc: FamilyDocument = {
      id: crypto.randomUUID(),
      type: addType,
      label: docType.label,
      emoji: docType.emoji,
      memberId: addMember,
      memberName: member ? `${member.emoji} ${member.name}` : "",
      note: addNote.trim(),
      images: addImages,
      createdAt: new Date().toISOString(),
    };
    const updated = [newDoc, ...docs];
    setDocs(updated);
    saveDocs(updated);
    setAddOpen(false);
    setAddType("carte_vitale");
    setAddMember("");
    setAddNote("");
    setAddImages([]);
  }

  function deleteDoc(id: string) {
    const updated = docs.filter((d) => d.id !== id);
    setDocs(updated);
    saveDocs(updated);
    setViewDoc(null);
  }

  const filtered = filterMember === "all" ? docs : docs.filter((d) => d.memberId === filterMember);

  // Group by member
  const grouped: Record<string, FamilyDocument[]> = {};
  for (const d of filtered) {
    if (!grouped[d.memberName]) grouped[d.memberName] = [];
    grouped[d.memberName].push(d);
  }

  return (
    <div>
      {/* Filter + add */}
      <div className="flex items-center gap-2 mb-4">
        {members.length > 1 && (
          <div className="flex gap-1 flex-1 overflow-x-auto">
            <button
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0"
              style={{ background: filterMember === "all" ? "var(--accent-soft)" : "var(--surface2)", color: filterMember === "all" ? "var(--accent)" : "var(--dim)" }}
              onClick={() => setFilterMember("all")}
            >Tous</button>
            {members.map((m) => (
              <button key={m.id}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0"
                style={{ background: filterMember === m.id ? "var(--accent-soft)" : "var(--surface2)", color: filterMember === m.id ? "var(--accent)" : "var(--dim)" }}
                onClick={() => setFilterMember(m.id)}
              >{m.emoji} {m.name}</button>
            ))}
          </div>
        )}
        <button className="btn btn-primary text-sm shrink-0" onClick={() => setAddOpen(true)}>+ Doc</button>
      </div>

      {filtered.length === 0 && (
        <EmptyState icon="📄" title="Aucun document" subtitle="Ajoute tes documents familiaux pour les avoir toujours sous la main" />
      )}

      {/* Documents grouped by member */}
      {Object.entries(grouped).map(([memberName, memberDocs]) => (
        <div key={memberName} className="mb-4">
          <p className="text-[10px] font-bold uppercase mb-2 px-1" style={{ color: "var(--dim)" }}>{memberName}</p>
          <div className="flex flex-col gap-1.5">
            {memberDocs.map((doc) => (
              <button
                key={doc.id}
                className="card !mb-0 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform text-left w-full"
                onClick={() => setViewDoc(doc)}
              >
                <span className="text-xl">{doc.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{doc.label}</p>
                  {doc.note && <p className="text-[10px] truncate" style={{ color: "var(--dim)" }}>{doc.note}</p>}
                </div>
                {doc.images.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
                    {doc.images.length} 📷
                  </span>
                )}
                <span className="text-sm" style={{ color: "var(--faint)" }}>›</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* View doc modal */}
      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} title={viewDoc ? `${viewDoc.emoji} ${viewDoc.label}` : ""}>
        {viewDoc && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--dim)" }}>
              <span>{viewDoc.memberName}</span>
              <span>·</span>
              <span>{new Date(viewDoc.createdAt).toLocaleDateString("fr-FR")}</span>
            </div>
            {viewDoc.note && (
              <p className="text-sm" style={{ color: "var(--text)" }}>{viewDoc.note}</p>
            )}
            {viewDoc.images.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {viewDoc.images.map((img, i) => (
                  <button key={i} className="rounded-xl overflow-hidden cursor-pointer" onClick={() => setViewImage(img)}>
                    <img src={img} alt={`${viewDoc.label} ${i + 1}`} className="w-full h-32 object-cover" />
                  </button>
                ))}
              </div>
            )}
            <button
              className="text-xs font-bold py-2 rounded-xl"
              style={{ background: "rgba(239,68,68,0.1)", color: "var(--red, #ef4444)" }}
              onClick={() => deleteDoc(viewDoc.id)}
            >Supprimer ce document</button>
          </div>
        )}
      </Modal>

      {/* Fullscreen image viewer */}
      {viewImage && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90"
          onClick={() => setViewImage(null)}
        >
          <img src={viewImage} alt="Document" className="max-w-full max-h-full object-contain" />
          <button
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl"
            style={{ background: "rgba(255,255,255,0.2)" }}
            onClick={() => setViewImage(null)}
          >✕</button>
        </div>
      )}

      {/* Add doc modal */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); setAddImages([]); }} title="Nouveau document">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color: "var(--dim)" }}>Type de document</label>
            <div className="flex flex-wrap gap-1.5">
              {DOC_TYPES.map((d) => (
                <button key={d.type}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                  style={{
                    background: addType === d.type ? "var(--accent-soft)" : "var(--surface2)",
                    color: addType === d.type ? "var(--accent)" : "var(--dim)",
                    border: addType === d.type ? "1px solid var(--accent)" : "1px solid transparent",
                  }}
                  onClick={() => setAddType(d.type)}
                >{d.emoji} {d.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color: "var(--dim)" }}>Membre</label>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <button key={m.id}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                  style={{
                    background: addMember === m.id ? "var(--accent-soft)" : "var(--surface2)",
                    color: addMember === m.id ? "var(--accent)" : "var(--dim)",
                    border: addMember === m.id ? "1px solid var(--accent)" : "1px solid transparent",
                  }}
                  onClick={() => setAddMember(m.id)}
                >{m.emoji} {m.name}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Note (optionnel)</label>
            <input
              className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
              placeholder="N° de carte, date d'expiration..."
            />
          </div>
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color: "var(--dim)" }}>Photos du document</label>
            <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleFile} />
            <div className="flex gap-2 flex-wrap">
              {addImages.map((img, i) => (
                <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white"
                    style={{ background: "rgba(0,0,0,0.6)" }}
                    onClick={() => setAddImages(addImages.filter((_, j) => j !== i))}
                  >✕</button>
                </div>
              ))}
              <button
                className="w-20 h-20 rounded-xl flex flex-col items-center justify-center text-xs"
                style={{ background: "var(--surface2)", color: "var(--dim)", border: "2px dashed var(--glass-border)" }}
                onClick={() => fileRef.current?.click()}
              >
                <span className="text-lg mb-0.5">📷</span>
                Photo
              </button>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={addDoc}
            disabled={!addMember}
          >Ajouter</button>
        </div>
      </Modal>
    </div>
  );
}

// ---- Routine types ----
interface RoutineStep {
  id: string;
  label: string;
  emoji: string;
  duration: number;
}

interface Routine {
  id: string;
  name: string;
  type: "matin" | "soir";
  memberId: string;
  steps: RoutineStep[];
}

interface RoutineTabProps {
  members: Member[];
  childMembers: Member[];
  defaultMorning: RoutineStep[];
  defaultEvening: RoutineStep[];
  loadRoutines: () => Routine[];
  saveRoutines: (r: Routine[]) => void;
  loadDone: () => Record<string, string[]>;
  saveDone: (d: Record<string, string[]>) => void;
  genId: () => string;
}

function RoutineTab({ members, childMembers, defaultMorning, defaultEvening, loadRoutines, saveRoutines, loadDone, saveDone, genId }: RoutineTabProps) {
  const [routines, setRoutines] = useState<Routine[]>(() => loadRoutines());
  const [doneMap, setDoneMap] = useState<Record<string, string[]>>(() => loadDone());
  const [activeTimer, setActiveTimer] = useState<{ routineId: string; stepId: string; endTime: number } | null>(null);
  const [timerLeft, setTimerLeft] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupMember, setSetupMember] = useState("");
  const [setupType, setSetupType] = useState<"matin" | "soir">("matin");
  const [filterMember, setFilterMember] = useState<string>("all");

  // Timer tick
  useEffect(() => {
    if (!activeTimer) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((activeTimer.endTime - Date.now()) / 1000));
      setTimerLeft(left);
      if (left <= 0) {
        clearInterval(id);
        // Auto-validate step when timer ends
        toggleStep(activeTimer.routineId, activeTimer.stepId);
        setActiveTimer(null);
      }
    }, 500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimer]);

  function toggleStep(routineId: string, stepId: string) {
    const newDone = { ...doneMap };
    const key = routineId;
    if (!newDone[key]) newDone[key] = [];
    if (newDone[key].includes(stepId)) {
      newDone[key] = newDone[key].filter((s) => s !== stepId);
    } else {
      newDone[key] = [...newDone[key], stepId];
    }
    setDoneMap(newDone);
    saveDone(newDone);
  }

  function startTimer(routineId: string, step: RoutineStep) {
    setActiveTimer({
      routineId,
      stepId: step.id,
      endTime: Date.now() + step.duration * 60 * 1000,
    });
    setTimerLeft(step.duration * 60);
  }

  function addRoutine() {
    if (!setupMember) return;
    const member = members.find((m) => m.id === setupMember);
    if (!member) return;
    const steps = setupType === "matin"
      ? defaultMorning.map((s) => ({ ...s, id: genId() }))
      : defaultEvening.map((s) => ({ ...s, id: genId() }));
    const newRoutine: Routine = {
      id: genId(),
      name: `Routine ${setupType === "matin" ? "du matin" : "du soir"} — ${member.emoji} ${member.name}`,
      type: setupType,
      memberId: setupMember,
      steps,
    };
    const updated = [...routines, newRoutine];
    setRoutines(updated);
    saveRoutines(updated);
    setSetupOpen(false);
    setSetupMember("");
  }

  function deleteRoutine(id: string) {
    const updated = routines.filter((r) => r.id !== id);
    setRoutines(updated);
    saveRoutines(updated);
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const filtered = filterMember === "all" ? routines : routines.filter((r) => r.memberId === filterMember);

  return (
    <div>
      {/* Filter + add */}
      <div className="flex items-center gap-2 mb-4">
        {childMembers.length > 1 && (
          <div className="flex gap-1 flex-1 overflow-x-auto">
            <button
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0"
              style={{ background: filterMember === "all" ? "var(--accent-soft)" : "var(--surface2)", color: filterMember === "all" ? "var(--accent)" : "var(--dim)" }}
              onClick={() => setFilterMember("all")}
            >Tous</button>
            {childMembers.map((m) => (
              <button key={m.id}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold shrink-0"
                style={{ background: filterMember === m.id ? "var(--accent-soft)" : "var(--surface2)", color: filterMember === m.id ? "var(--accent)" : "var(--dim)" }}
                onClick={() => setFilterMember(m.id)}
              >{m.emoji} {m.name}</button>
            ))}
          </div>
        )}
        <button
          className="btn btn-primary text-sm shrink-0"
          onClick={() => setSetupOpen(true)}
        >+ Routine</button>
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon="🌅"
          title="Aucune routine"
          subtitle={childMembers.length === 0
            ? "Ajoute d'abord un membre (fils, fille, ado...) dans Famille"
            : "Crée une routine matin ou soir pour tes enfants"}
        />
      )}

      {filtered.map((routine) => {
        const done = doneMap[routine.id] || [];
        const total = routine.steps.length;
        const completed = done.length;
        const allDone = completed === total;
        const member = members.find((m) => m.id === routine.memberId);
        const progress = total > 0 ? (completed / total) * 100 : 0;

        return (
          <div key={routine.id} className="card !mb-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{routine.type === "matin" ? "🌅" : "🌙"}</span>
                <div>
                  <p className="text-sm font-bold">{routine.type === "matin" ? "Routine du matin" : "Routine du soir"}</p>
                  <p className="text-[10px]" style={{ color: "var(--dim)" }}>{member?.emoji} {member?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {allDone && <span className="text-lg">🎉</span>}
                <button className="text-xs p-1" style={{ color: "var(--red, #ef4444)" }} onClick={() => deleteRoutine(routine.id)}>✕</button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: "var(--surface2)" }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progress}%`,
                  background: allDone ? "var(--green, #22c55e)" : "var(--accent)",
                }}
              />
            </div>
            <p className="text-[10px] font-bold mb-3" style={{ color: allDone ? "var(--green, #22c55e)" : "var(--dim)" }}>
              {allDone ? "Tout est fait, bravo !" : `${completed}/${total} étapes`}
            </p>

            {/* Steps */}
            <div className="flex flex-col gap-1.5">
              {routine.steps.map((step) => {
                const isDone = done.includes(step.id);
                const isTimerActive = activeTimer?.routineId === routine.id && activeTimer?.stepId === step.id;
                const timerProgress = isTimerActive ? Math.max(0, 1 - timerLeft / (step.duration * 60)) : 0;

                return (
                  <button
                    key={step.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left w-full relative overflow-hidden"
                    style={{
                      background: isDone ? "rgba(34,197,94,0.1)" : isTimerActive ? "var(--accent-soft)" : "var(--surface2)",
                      opacity: isDone ? 0.6 : 1,
                    }}
                    onClick={() => {
                      if (isDone) {
                        // Tap sur un step validé → annuler
                        toggleStep(routine.id, step.id);
                      } else if (isTimerActive) {
                        // Tap pendant timer → skip, valider immédiatement
                        setActiveTimer(null);
                        toggleStep(routine.id, step.id);
                      } else {
                        // Tap sur step non fait → lancer le timer
                        startTimer(routine.id, step);
                      }
                    }}
                  >
                    {/* Timer progress bar background */}
                    {isTimerActive && (
                      <div
                        className="absolute inset-0 transition-all"
                        style={{
                          background: "var(--accent)",
                          opacity: 0.1,
                          width: `${timerProgress * 100}%`,
                        }}
                      />
                    )}

                    {/* Check indicator */}
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 relative z-10"
                      style={{
                        background: isDone ? "var(--green, #22c55e)" : isTimerActive ? "var(--accent)" : "transparent",
                        border: isDone || isTimerActive ? "none" : "2px solid var(--glass-border)",
                        color: "#fff",
                      }}
                    >
                      {isDone ? "✓" : isTimerActive ? "⏱" : ""}
                    </div>

                    <span className="text-base relative z-10">{step.emoji}</span>
                    <span className={`text-xs flex-1 font-medium relative z-10 ${isDone ? "line-through" : ""}`}>{step.label}</span>

                    {/* Timer countdown or duration label */}
                    <span className="text-[10px] font-bold tabular-nums relative z-10 px-2 py-1 rounded-lg"
                      style={{
                        background: isTimerActive ? "var(--accent)" : isDone ? "transparent" : "var(--accent-soft)",
                        color: isTimerActive ? "#fff" : isDone ? "var(--green, #22c55e)" : "var(--accent)",
                      }}
                    >
                      {isDone ? "✓" : isTimerActive ? formatTime(timerLeft) : `${step.duration} min`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Setup modal */}
      <Modal open={setupOpen} onClose={() => setSetupOpen(false)} title="Nouvelle routine">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color: "var(--dim)" }}>Type</label>
            <div className="flex gap-2">
              <button
                className="flex-1 py-3 rounded-xl text-sm font-bold"
                style={{ background: setupType === "matin" ? "var(--accent-soft)" : "var(--surface2)", color: setupType === "matin" ? "var(--accent)" : "var(--dim)", border: setupType === "matin" ? "1px solid var(--accent)" : "1px solid transparent" }}
                onClick={() => setSetupType("matin")}
              >🌅 Matin</button>
              <button
                className="flex-1 py-3 rounded-xl text-sm font-bold"
                style={{ background: setupType === "soir" ? "var(--accent-soft)" : "var(--surface2)", color: setupType === "soir" ? "var(--accent)" : "1px solid transparent", border: setupType === "soir" ? "1px solid var(--accent)" : "1px solid transparent" }}
                onClick={() => setSetupType("soir")}
              >🌙 Soir</button>
            </div>
          </div>
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color: "var(--dim)" }}>Enfant</label>
            {childMembers.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--faint)" }}>Aucun membre enfant trouvé. Ajoute un membre avec le rôle Fils, Fille ou Ado dans Famille.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {childMembers.map((m) => (
                  <button key={m.id}
                    className="px-3 py-2 rounded-xl text-xs font-bold"
                    style={{ background: setupMember === m.id ? "var(--accent-soft)" : "var(--surface2)", color: setupMember === m.id ? "var(--accent)" : "var(--dim)", border: setupMember === m.id ? "1px solid var(--accent)" : "1px solid transparent" }}
                    onClick={() => setSetupMember(m.id)}
                  >{m.emoji} {m.name}</button>
                ))}
              </div>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={addRoutine}
            disabled={!setupMember}
          >Créer la routine</button>
        </div>
      </Modal>
    </div>
  );
}

export default function ViePage() {
  const { profile, setVieUnread } = useProfile();
  const { toast, toastUndo } = useToast();
  const { pullDistance, refreshing } = usePullToRefresh(() => loadData());
  const searchParams = useSearchParams();
  const validTabs = ["notes", "courses", "taches", "routines", "documents"] as const;
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

  // Shopping state
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [newShoppingText, setNewShoppingText] = useState("");
  const [shoppingCat, setShoppingCat] = useState("all");

  // Chores state
  const [chores, setChores] = useState<Chore[]>([]);
  const [choreModal, setChoreModal] = useState(false);
  const [choreName, setChoreName] = useState("");
  const [choreEmoji, setChoreEmoji] = useState("🧹");
  const [choreFreq, setChoreFreq] = useState<"daily" | "weekly">("weekly");
  const [choreMembers, setChoreMembers] = useState<string[]>([]);

  // Comment counts per note
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataLoadedRef = useRef(false);

  // --- Badge "nouveautés" helpers ---
  const TAB_KEYS = ["notes", "courses", "taches", "routines", "documents"] as const;

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
      notes, courses: shoppingItems,
      taches: chores, routines: [], documents: [],
    };
    for (const key of TAB_KEYS) {
      const lastSeen = getLastSeen(key);
      counts[key] = (dataMap[key] || []).filter((item) => item.created_at > lastSeen).length;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, shoppingItems, chores]);

  // Mark the active tab as seen once data loads & propagate total to Navbar
  useEffect(() => {
    const hasData = notes.length || shoppingItems.length || chores.length;
    if (hasData && !dataLoadedRef.current) {
      dataLoadedRef.current = true;
      markSeen(tab);
    }
  }, [notes, shoppingItems, chores, tab]);

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
    const [notesRes, bdayRes, memRes, shopRes, choreRes] = await Promise.all([
      supabase.from("notes").select("*").eq("family_id", profile.family_id).order("pinned", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("birthdays").select("*").eq("family_id", profile.family_id),
      supabase.from("members").select("*").eq("family_id", profile.family_id),
      supabase.from("shopping_items").select("*").eq("family_id", profile.family_id).order("created_at", { ascending: false }),
      supabase.from("chores").select("*").eq("family_id", profile.family_id).order("created_at", { ascending: false }),
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
    const memberIds = new Set(loadedMembers.map((m) => m.id));
    setBirthdays(loadedBdays.filter((b) => b.member_id && memberIds.has(b.member_id)));
    setMembers(loadedMembers);
    if (shopRes.data) setShoppingItems(shopRes.data as ShoppingItem[]);
    if (choreRes.data) setChores(choreRes.data as Chore[]);
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

  return (
    <div className="px-4 py-4 animate-in gradient-bg" style={{ paddingBottom: 80 }}>
      <PullIndicator pullDistance={pullDistance} refreshing={refreshing} />
      <h1 className="text-xl font-bold mb-4">Vie de famille</h1>

      {/* Tab switcher */}
      <div data-tutorial="vie-tabs" className="flex gap-1 mb-5 overflow-x-auto overflow-y-visible pb-1 pt-2">
        {([
          ["notes", "📝", "Notes"],
          ["courses", "🛒", "Courses"],
          ["taches", "🧹", "Tâches"],
          ["routines", "🌅", "Routines"],
          ["documents", "📄", "Docs"],
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
              data-tutorial="vie-add-item"
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
            last_rotated: localDateStr(new Date()),
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
            last_rotated: localDateStr(new Date()),
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
                      <button className="text-xs p-1" style={{ color: "var(--red)" }} onClick={() => deleteChore(chore.id)}>✕</button>
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
          <button className="btn btn-primary" onClick={() => { const addChore = async () => { if (!profile?.family_id || !choreName.trim()) return; await supabase.from("chores").insert({ family_id: profile.family_id, name: choreName.trim(), emoji: choreEmoji, frequency: choreFreq, assigned_members: choreMembers, current_index: 0, last_rotated: localDateStr(new Date()) }); notifyFamily("FlowTime 🧹", `${profile.first_name || "Quelqu'un"} a ajouté une tâche : ${choreEmoji} ${choreName.trim()}`); setChoreModal(false); setChoreName(""); setChoreEmoji("🧹"); setChoreMembers([]); loadData(); }; addChore(); }}>
            Ajouter
          </button>
        </div>
      </Modal>

      {/* Routines tab */}
      {tab === "routines" && (() => {
        const ROUTINE_STORAGE_KEY = `flowtime_routines_${profile?.family_id}`;
        const ROUTINE_DONE_KEY = `flowtime_routines_done_${profile?.family_id}_${localDateStr(new Date())}`;

        // Load routines from localStorage
        function loadRoutines(): Routine[] {
          try {
            const raw = localStorage.getItem(ROUTINE_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
          } catch { return []; }
        }

        function saveRoutines(r: Routine[]) {
          localStorage.setItem(ROUTINE_STORAGE_KEY, JSON.stringify(r));
        }

        // Load done steps for today
        function loadDone(): Record<string, string[]> {
          try {
            const raw = localStorage.getItem(ROUTINE_DONE_KEY);
            return raw ? JSON.parse(raw) : {};
          } catch { return {}; }
        }

        function saveDone(d: Record<string, string[]>) {
          localStorage.setItem(ROUTINE_DONE_KEY, JSON.stringify(d));
        }

        const DEFAULT_MORNING: RoutineStep[] = [
          { id: genId(), label: "Se lever", emoji: "🌅", duration: 2 },
          { id: genId(), label: "Se brosser les dents", emoji: "🪥", duration: 3 },
          { id: genId(), label: "S'habiller", emoji: "👕", duration: 5 },
          { id: genId(), label: "Petit-déjeuner", emoji: "🥣", duration: 15 },
          { id: genId(), label: "Préparer le cartable", emoji: "🎒", duration: 3 },
        ];

        const DEFAULT_EVENING: RoutineStep[] = [
          { id: genId(), label: "Ranger ses affaires", emoji: "🧹", duration: 5 },
          { id: genId(), label: "Douche / bain", emoji: "🚿", duration: 10 },
          { id: genId(), label: "Pyjama", emoji: "🌙", duration: 3 },
          { id: genId(), label: "Brosser les dents", emoji: "🪥", duration: 3 },
          { id: genId(), label: "Histoire / câlin", emoji: "📖", duration: 10 },
          { id: genId(), label: "Au lit !", emoji: "😴", duration: 2 },
        ];

        const childMembers = members.filter((m) =>
          ["fils", "fille", "ado_garcon", "ado_fille", "petit-fils", "petite-fille", "bebe"].includes((m.role || "").toLowerCase())
        );

        return (
          <RoutineTab
            members={members}
            childMembers={childMembers}
            defaultMorning={DEFAULT_MORNING}
            defaultEvening={DEFAULT_EVENING}
            loadRoutines={loadRoutines}
            saveRoutines={saveRoutines}
            loadDone={loadDone}
            saveDone={saveDone}
            genId={genId}
          />
        );
      })()}

      {/* Documents tab */}
      {tab === "documents" && (
        <DocumentsTab members={members} familyId={profile?.family_id || ""} />
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
