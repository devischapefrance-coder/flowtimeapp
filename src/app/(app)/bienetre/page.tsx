"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import Timer from "@/components/Timer";
import BreathingCircle from "@/components/BreathingCircle";

// ---- DATA ----
const ACTIVITIES = [
  { key: "meditation", emoji: "🧘", name: "Méditation" },
  { key: "sport", emoji: "💪", name: "Sport" },
  { key: "yoga", emoji: "🧘‍♀️", name: "Yoga" },
  { key: "lecture", emoji: "📖", name: "Lecture" },
  { key: "sons", emoji: "🎵", name: "Sons ambiants" },
  { key: "respiration", emoji: "🌬️", name: "Respiration" },
];

const EXERCISES = [
  { name: "Pompes", emoji: "💪", sets: 3, reps: "15" },
  { name: "Squats", emoji: "🦵", sets: 3, reps: "20" },
  { name: "Planche", emoji: "🧱", sets: 3, reps: "30s" },
  { name: "Burpees", emoji: "🔥", sets: 3, reps: "10" },
  { name: "Fentes", emoji: "🦿", sets: 3, reps: "12/jambe" },
  { name: "Mountain Climbers", emoji: "⛰️", sets: 3, reps: "20" },
  { name: "Jumping Jacks", emoji: "⭐", sets: 3, reps: "30" },
  { name: "Crunchs", emoji: "🎯", sets: 3, reps: "20" },
  { name: "Dips", emoji: "💺", sets: 3, reps: "12" },
  { name: "Bridge", emoji: "🌉", sets: 3, reps: "15" },
  { name: "Superman", emoji: "🦸", sets: 3, reps: "12" },
  { name: "High Knees", emoji: "🏃", sets: 3, reps: "30" },
  { name: "Deadbugs", emoji: "🐛", sets: 3, reps: "10/côté" },
  { name: "Wall Sit", emoji: "🧱", sets: 3, reps: "30s" },
  { name: "Bicycle Crunch", emoji: "🚴", sets: 3, reps: "20" },
];

const YOGA_POSES = [
  { name: "Montagne", emoji: "🏔️", duration: 60, level: "débutant", desc: "Debout, pieds joints, bras le long du corps. Étirez la colonne vers le ciel." },
  { name: "Chien tête en bas", emoji: "🐕", duration: 45, level: "débutant", desc: "Formez un V inversé, mains et pieds au sol, hanches vers le ciel." },
  { name: "Guerrier I", emoji: "⚔️", duration: 45, level: "débutant", desc: "Fente avant, bras levés, regard vers le ciel." },
  { name: "Guerrier II", emoji: "🗡️", duration: 45, level: "débutant", desc: "Fente latérale, bras tendus horizontalement, regard sur la main avant." },
  { name: "Arbre", emoji: "🌳", duration: 30, level: "débutant", desc: "En équilibre sur un pied, l'autre pied contre la cuisse, mains jointes." },
  { name: "Triangle", emoji: "📐", duration: 45, level: "intermédiaire", desc: "Jambes écartées, penchez le buste vers un pied, bras vertical." },
  { name: "Cobra", emoji: "🐍", duration: 30, level: "débutant", desc: "Allongé face au sol, poussez sur les mains pour lever le buste." },
  { name: "Enfant", emoji: "👶", duration: 60, level: "débutant", desc: "Genoux au sol, bras étendus vers l'avant, front au sol." },
  { name: "Pont", emoji: "🌉", duration: 30, level: "intermédiaire", desc: "Sur le dos, pieds au sol, levez les hanches vers le ciel." },
  { name: "Chat-Vache", emoji: "🐱", duration: 45, level: "débutant", desc: "À quatre pattes, alternez dos creux et dos rond." },
  { name: "Pigeon", emoji: "🕊️", duration: 45, level: "intermédiaire", desc: "Une jambe pliée devant, l'autre étendue derrière." },
  { name: "Demi-lune", emoji: "🌙", duration: 30, level: "intermédiaire", desc: "Debout, penchez-vous latéralement, un bras levé." },
  { name: "Aigle", emoji: "🦅", duration: 30, level: "avancé", desc: "En équilibre, jambes et bras entrelacés." },
  { name: "Torsion assise", emoji: "🔄", duration: 45, level: "intermédiaire", desc: "Assis, une jambe croisée, tournez le buste." },
  { name: "Savasana", emoji: "😌", duration: 120, level: "débutant", desc: "Allongé sur le dos, bras le long du corps, relâchez tout." },
];

const AMBIANCES = [
  { name: "Pluie", emoji: "🌧️", color: "#64B5F6" },
  { name: "Océan", emoji: "🌊", color: "#3DD6C8" },
  { name: "Forêt", emoji: "🌲", color: "#6BCB77" },
  { name: "Feu de cheminée", emoji: "🔥", color: "#FF8C42" },
  { name: "Vent", emoji: "💨", color: "#B39DDB" },
  { name: "Nuit d'été", emoji: "🦗", color: "#FFD166" },
];

const BREATHING_PROGRAMS = [
  { name: "Cohérence cardiaque", phases: [{ label: "Inspirez...", duration: 5 }, { label: "Expirez...", duration: 5 }] },
  { name: "4-7-8", phases: [{ label: "Inspirez...", duration: 4 }, { label: "Retenez...", duration: 7 }, { label: "Expirez...", duration: 8 }] },
  { name: "Box breathing", phases: [{ label: "Inspirez...", duration: 4 }, { label: "Retenez...", duration: 4 }, { label: "Expirez...", duration: 4 }, { label: "Retenez...", duration: 4 }] },
  { name: "Relaxation", phases: [{ label: "Inspirez...", duration: 6 }, { label: "Expirez...", duration: 6 }] },
];

// ---- COMPONENT ----
export default function BienetirePage() {
  const { profile } = useProfile();
  const [view, setView] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [lastActivity, setLastActivity] = useState<Record<string, string>>({});

  // Meditation
  const [medDuration, setMedDuration] = useState(5);
  const [medActive, setMedActive] = useState(false);

  // Sport
  const [sportExIndex, setSportExIndex] = useState(0);
  const [sportSet, setSportSet] = useState(1);
  const [sportResting, setSportResting] = useState(false);
  const [sportDone, setSportDone] = useState(false);
  const [sportStarted, setSportStarted] = useState(false);

  // Yoga
  const [yogaPoseIndex, setYogaPoseIndex] = useState(0);
  const [yogaActive, setYogaActive] = useState(false);

  // Lecture
  const [lectureActive, setLectureActive] = useState(false);

  // Sons
  const [activeAmbiance, setActiveAmbiance] = useState<number | null>(null);

  // Respiration
  const [breathProgram, setBreathProgram] = useState(0);
  const [breathCycles, setBreathCycles] = useState(10);
  const [breathActive, setBreathActive] = useState(false);

  const loadStreak = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("wellbeing_sessions")
      .select("date")
      .eq("user_id", profile.id)
      .order("date", { ascending: false });
    if (!data || data.length === 0) { setStreak(0); return; }

    // Calculate streak
    let count = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dates = [...new Set(data.map((d) => d.date))];

    for (let i = 0; i < dates.length; i++) {
      const d = new Date(dates[i]);
      d.setHours(0, 0, 0, 0);
      const expected = new Date(today);
      expected.setDate(expected.getDate() - i);
      if (d.getTime() === expected.getTime()) {
        count++;
      } else {
        break;
      }
    }
    setStreak(count);

    // Last activity per type
    const { data: all } = await supabase
      .from("wellbeing_sessions")
      .select("activity, date")
      .eq("user_id", profile.id)
      .order("date", { ascending: false });
    if (all) {
      const last: Record<string, string> = {};
      for (const s of all) {
        if (!last[s.activity]) last[s.activity] = s.date;
      }
      setLastActivity(last);
    }
  }, [profile]);

  useEffect(() => { loadStreak(); }, [loadStreak]);

  async function saveSession(activity: string, minutes: number) {
    if (!profile) return;
    await supabase.from("wellbeing_sessions").insert({
      user_id: profile.id,
      activity,
      minutes,
      date: new Date().toISOString().split("T")[0],
    });
    loadStreak();
  }

  function daysAgo(dateStr: string | undefined): string {
    if (!dateStr) return "Jamais";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return "Hier";
    return `Il y a ${diff} jours`;
  }

  function levelColor(level: string): string {
    if (level === "débutant") return "var(--green)";
    if (level === "intermédiaire") return "var(--warm)";
    return "var(--red)";
  }

  // ---- VIEWS ----
  if (view === "meditation") {
    return (
      <div className="px-4 py-4 animate-in">
        <button className="text-sm mb-4" style={{ color: "var(--accent)" }} onClick={() => { setView(null); setMedActive(false); }}>← Retour</button>
        <h2 className="text-lg font-extrabold mb-4">🧘 Méditation</h2>
        {!medActive ? (
          <div>
            <p className="label">Durée</p>
            <div className="flex gap-2 mb-6">
              {[5, 10, 15, 20, 30].map((d) => (
                <button key={d} className="btn btn-secondary !w-auto !px-4 !py-2 text-sm" style={{ background: medDuration === d ? "var(--accent)" : undefined, color: medDuration === d ? "#fff" : undefined }} onClick={() => setMedDuration(d)}>
                  {d} min
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => setMedActive(true)}>Commencer</button>
          </div>
        ) : (
          <Timer duration={medDuration * 60} onComplete={() => { setMedActive(false); saveSession("meditation", medDuration); alert("Bravo ! Session terminée 🧘"); }} />
        )}
      </div>
    );
  }

  if (view === "sport") {
    const ex = EXERCISES[sportExIndex];
    return (
      <div className="px-4 py-4 animate-in">
        <button className="text-sm mb-4" style={{ color: "var(--accent)" }} onClick={() => { setView(null); setSportStarted(false); setSportDone(false); setSportExIndex(0); setSportSet(1); }}>← Retour</button>
        <h2 className="text-lg font-extrabold mb-4">💪 Sport</h2>
        {sportDone ? (
          <div className="text-center py-8">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-lg font-bold">Bravo ! Séance terminée !</p>
          </div>
        ) : !sportStarted ? (
          <div>
            <p className="text-sm mb-4" style={{ color: "var(--dim)" }}>{EXERCISES.length} exercices · 3 sets chacun</p>
            {EXERCISES.map((e, i) => (
              <div key={i} className="card flex items-center gap-3">
                <span className="text-xl">{e.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold">{e.name}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>{e.sets}×{e.reps}</p>
                </div>
              </div>
            ))}
            <button className="btn btn-primary mt-4" onClick={() => setSportStarted(true)}>Commencer</button>
          </div>
        ) : sportResting ? (
          <div className="text-center">
            <p className="label">Repos</p>
            <Timer duration={30} color="var(--teal)" onComplete={() => setSportResting(false)} />
          </div>
        ) : (
          <div className="text-center">
            <p className="text-4xl mb-2">{ex.emoji}</p>
            <p className="text-lg font-extrabold">{ex.name}</p>
            <p className="text-sm mt-2" style={{ color: "var(--dim)" }}>Set {sportSet}/{ex.sets} — {ex.reps} reps</p>
            <div className="flex justify-center gap-3 mt-6">
              <button className="btn btn-secondary !w-auto !px-4" disabled={sportExIndex === 0 && sportSet === 1} onClick={() => {
                if (sportSet > 1) setSportSet(sportSet - 1);
                else { setSportExIndex(sportExIndex - 1); setSportSet(3); }
              }}>⏮️</button>
              <button className="btn btn-primary !w-auto !px-6" onClick={() => {
                if (sportSet < ex.sets) {
                  setSportSet(sportSet + 1);
                  setSportResting(true);
                } else if (sportExIndex < EXERCISES.length - 1) {
                  setSportExIndex(sportExIndex + 1);
                  setSportSet(1);
                  setSportResting(true);
                } else {
                  setSportDone(true);
                  saveSession("sport", 30);
                }
              }}>✅ Set terminé</button>
              <button className="btn btn-secondary !w-auto !px-4" onClick={() => {
                if (sportExIndex < EXERCISES.length - 1) {
                  setSportExIndex(sportExIndex + 1);
                  setSportSet(1);
                }
              }}>⏭️</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === "yoga") {
    const pose = YOGA_POSES[yogaPoseIndex];
    return (
      <div className="px-4 py-4 animate-in">
        <button className="text-sm mb-4" style={{ color: "var(--accent)" }} onClick={() => { setView(null); setYogaActive(false); setYogaPoseIndex(0); }}>← Retour</button>
        <h2 className="text-lg font-extrabold mb-4">🧘‍♀️ Yoga</h2>
        {!yogaActive ? (
          <div>
            {YOGA_POSES.map((p, i) => (
              <div key={i} className="card flex items-center gap-3">
                <span className="text-xl">{p.emoji}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold">{p.name}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>{p.duration}s</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${levelColor(p.level)}22`, color: levelColor(p.level) }}>{p.level}</span>
              </div>
            ))}
            <button className="btn btn-primary mt-4" onClick={() => setYogaActive(true)}>Commencer</button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-4xl mb-2">{pose.emoji}</p>
            <p className="text-lg font-extrabold">{pose.name}</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${levelColor(pose.level)}22`, color: levelColor(pose.level) }}>{pose.level}</span>
            <p className="text-sm mt-3 mb-4 px-4" style={{ color: "var(--dim)" }}>{pose.desc}</p>
            <Timer
              key={yogaPoseIndex}
              duration={pose.duration}
              color="var(--teal)"
              onComplete={() => {
                if (yogaPoseIndex < YOGA_POSES.length - 1) {
                  setYogaPoseIndex(yogaPoseIndex + 1);
                } else {
                  setYogaActive(false);
                  setYogaPoseIndex(0);
                  const totalMin = Math.round(YOGA_POSES.reduce((a, p) => a + p.duration, 0) / 60);
                  saveSession("yoga", totalMin);
                  alert("Namaste ! Session terminée 🧘‍♀️");
                }
              }}
            />
            <div className="flex justify-center gap-3 mt-4">
              <button className="btn btn-secondary !w-auto !px-4" disabled={yogaPoseIndex === 0} onClick={() => setYogaPoseIndex(yogaPoseIndex - 1)}>⏮️</button>
              <button className="btn btn-secondary !w-auto !px-4" disabled={yogaPoseIndex === YOGA_POSES.length - 1} onClick={() => setYogaPoseIndex(yogaPoseIndex + 1)}>⏭️</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === "lecture") {
    return (
      <div className="px-4 py-4 animate-in">
        <button className="text-sm mb-4" style={{ color: "var(--accent)" }} onClick={() => { setView(null); setLectureActive(false); }}>← Retour</button>
        <h2 className="text-lg font-extrabold mb-4">📖 Lecture</h2>
        {!lectureActive ? (
          <div className="text-center py-8">
            <p className="text-sm mb-6" style={{ color: "var(--dim)" }}>Le chronomètre mesure votre temps de lecture</p>
            <button className="btn btn-primary" onClick={() => setLectureActive(true)}>Commencer à lire</button>
          </div>
        ) : (
          <Timer
            duration={3600}
            countUp
            onComplete={() => {}}
          />
        )}
        {lectureActive && (
          <div className="text-center mt-4">
            <button className="btn btn-primary !w-auto !px-8" onClick={() => {
              setLectureActive(false);
              saveSession("lecture", 10);
              alert("Bonne lecture ! 📖");
            }}>
              ✅ Terminer
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === "sons") {
    return (
      <div className="px-4 py-4 animate-in">
        <button className="text-sm mb-4" style={{ color: "var(--accent)" }} onClick={() => { setView(null); setActiveAmbiance(null); }}>← Retour</button>
        <h2 className="text-lg font-extrabold mb-4">🎵 Sons ambiants</h2>
        <div className="grid grid-cols-2 gap-3">
          {AMBIANCES.map((a, i) => (
            <button
              key={i}
              className="card text-center cursor-pointer relative overflow-hidden"
              style={{ border: activeAmbiance === i ? `2px solid ${a.color}` : undefined }}
              onClick={() => setActiveAmbiance(activeAmbiance === i ? null : i)}
            >
              {activeAmbiance === i && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full animate-pulse" style={{ background: `${a.color}22` }} />
                  <div className="absolute w-14 h-14 rounded-full animate-pulse" style={{ background: `${a.color}33`, animationDelay: "0.5s" }} />
                </div>
              )}
              <span className="text-3xl relative">{a.emoji}</span>
              <p className="text-sm font-bold mt-2 relative">{a.name}</p>
            </button>
          ))}
        </div>
        <p className="text-xs text-center mt-4" style={{ color: "var(--faint)" }}>
          Audio bientôt disponible — interface de prévisualisation
        </p>
      </div>
    );
  }

  if (view === "respiration") {
    return (
      <div className="px-4 py-4 animate-in">
        <button className="text-sm mb-4" style={{ color: "var(--accent)" }} onClick={() => { setView(null); setBreathActive(false); }}>← Retour</button>
        <h2 className="text-lg font-extrabold mb-4">🌬️ Respiration</h2>
        {!breathActive ? (
          <div>
            <p className="label">Programme</p>
            <div className="flex flex-col gap-2 mb-4">
              {BREATHING_PROGRAMS.map((p, i) => (
                <button
                  key={i}
                  className="card text-left cursor-pointer"
                  style={{ border: breathProgram === i ? "1.5px solid var(--teal)" : undefined }}
                  onClick={() => setBreathProgram(i)}
                >
                  <p className="text-sm font-bold">{p.name}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>
                    {p.phases.map((ph) => `${ph.duration}s ${ph.label.replace("...", "")}`).join(" · ")}
                  </p>
                </button>
              ))}
            </div>
            <p className="label">Cycles</p>
            <div className="flex gap-2 mb-6">
              {[5, 10, 15, 20].map((c) => (
                <button key={c} className="btn btn-secondary !w-auto !px-4 !py-2 text-sm" style={{ background: breathCycles === c ? "var(--teal)" : undefined, color: breathCycles === c ? "#fff" : undefined }} onClick={() => setBreathCycles(c)}>
                  {c}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => setBreathActive(true)}>Commencer</button>
          </div>
        ) : (
          <BreathingCircle
            program={BREATHING_PROGRAMS[breathProgram]}
            totalCycles={breathCycles}
            onComplete={() => {
              setBreathActive(false);
              const totalSec = BREATHING_PROGRAMS[breathProgram].phases.reduce((a, p) => a + p.duration, 0) * breathCycles;
              saveSession("respiration", Math.round(totalSec / 60));
              alert("Bien joué ! 🌬️");
            }}
          />
        )}
      </div>
    );
  }

  // ---- MAIN GRID ----
  return (
    <div className="px-4 py-4 animate-in">
      <h1 className="text-xl font-extrabold mb-2">Bien-être</h1>

      {streak > 0 && (
        <div className="card flex items-center gap-2 mb-4">
          <span className="text-2xl">🔥</span>
          <span className="font-bold">{streak} jour{streak > 1 ? "s" : ""} consécutif{streak > 1 ? "s" : ""}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {ACTIVITIES.map((a) => (
          <button key={a.key} className="card text-center cursor-pointer" onClick={() => setView(a.key)}>
            <span className="text-[32px]">{a.emoji}</span>
            <p className="text-sm font-bold mt-2">{a.name}</p>
            <p className="text-[11px] mt-1" style={{ color: "var(--dim)" }}>
              Dernière : {daysAgo(lastActivity[a.key])}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
