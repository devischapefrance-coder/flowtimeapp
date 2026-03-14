"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface SearchResult {
  type: "event" | "member" | "contact" | "address" | "note" | "meal" | "chore";
  title: string;
  subtitle: string;
  emoji: string;
  href: string;
  data?: Record<string, string>;
}

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  familyId: string | undefined;
}

const RECENT_SEARCHES_KEY = "flowtime-recent-searches";
const MAX_RECENT = 5;

const WEATHER_CODES: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️",
  77: "🌨️", 80: "🌦️", 81: "🌧️", 82: "🌧️",
  85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(q: string) {
  const trimmed = q.trim();
  if (trimmed.length < 2) return;
  const recent = getRecentSearches().filter((s) => s !== trimmed);
  recent.unshift(trimmed);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function removeRecentSearch(q: string) {
  const recent = getRecentSearches().filter((s) => s !== q);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
}

function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}

const QUICK_ACTIONS = [
  { label: "Évènement", emoji: "📅", href: "/home?action=create" },
  { label: "Contact", emoji: "📞", href: "/famille?action=create" },
  { label: "Note", emoji: "📝", href: "/vie?action=create" },
  { label: "Tâche", emoji: "✅", href: "/vie?tab=taches" },
];

export default function SearchOverlay({ open, onClose, familyId }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<{ title: string; date: string; time: string; emoji: string }[]>([]);
  const [birthdays, setBirthdays] = useState<{ name: string; emoji: string; daysLeft: number; date: string }[]>([]);
  const [weatherData, setWeatherData] = useState<{ temp: number; icon: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setRecentSearches(getRecentSearches());
      setTimeout(() => inputRef.current?.focus(), 100);
      fetchUpcomingEvents();
      fetchBirthdays();
      fetchWeather();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, familyId]);

  async function fetchUpcomingEvents() {
    if (!familyId) return;
    const today = localDateStr(new Date());
    const { data } = await supabase
      .from("events")
      .select("title, date, time, category")
      .eq("family_id", familyId)
      .eq("scope", "famille")
      .gte("date", today)
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .limit(3);
    if (data) {
      setUpcomingEvents(data.map((e) => ({
        title: e.title,
        date: e.date,
        time: e.time || "",
        emoji: e.category === "sport" ? "🏃" : e.category === "medical" ? "🏥" : e.category === "school" ? "🎒" : "📅",
      })));
    }
  }

  async function fetchBirthdays() {
    if (!familyId) return;
    const { data } = await supabase
      .from("members")
      .select("name, emoji, birth_date")
      .eq("family_id", familyId)
      .not("birth_date", "is", null);
    if (!data) return;

    const today = new Date();
    const upcoming: typeof birthdays = [];

    for (const m of data) {
      if (!m.birth_date) continue;
      const bd = new Date(m.birth_date);
      const next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
      if (next < today) next.setFullYear(next.getFullYear() + 1);
      const diff = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diff <= 30) {
        upcoming.push({
          name: m.name,
          emoji: m.emoji || "🎂",
          daysLeft: diff,
          date: m.birth_date,
        });
      }
    }
    upcoming.sort((a, b) => a.daysLeft - b.daysLeft);
    setBirthdays(upcoming);
  }

  async function fetchWeather() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,weather_code&timezone=auto`
          );
          const data = await res.json();
          if (data.current) {
            setWeatherData({
              temp: Math.round(data.current.temperature_2m),
              icon: WEATHER_CODES[data.current.weather_code] || "🌡️",
            });
          }
        } catch { /* ignore */ }
      },
      () => { /* geoloc refused, hide widget */ }
    );
  }

  const search = useCallback(async (q: string) => {
    if (!q.trim() || !familyId) {
      setResults([]);
      return;
    }

    saveRecentSearch(q);
    setRecentSearches(getRecentSearches());

    const found: SearchResult[] = [];
    const pattern = `%${q}%`;

    const [evRes, memRes, contRes, addrRes, noteByTitle, noteByContent, mealRes, choreRes] = await Promise.all([
      supabase.from("events").select("title, date, time, members(name)").eq("family_id", familyId).ilike("title", pattern).limit(10),
      supabase.from("members").select("name, role, emoji").eq("family_id", familyId).ilike("name", pattern).limit(10),
      supabase.from("contacts").select("name, phone, relation, emoji").eq("family_id", familyId).ilike("name", pattern).limit(10),
      supabase.from("addresses").select("name, address, emoji").eq("family_id", familyId).ilike("name", pattern).limit(10),
      supabase.from("notes").select("id, title, content").eq("family_id", familyId).ilike("title", pattern).limit(10),
      supabase.from("notes").select("id, title, content").eq("family_id", familyId).ilike("content", pattern).limit(10),
      supabase.from("meals").select("name, date, type, emoji").eq("family_id", familyId).ilike("name", pattern).limit(10),
      supabase.from("chores").select("name, assigned_to, done, emoji").eq("family_id", familyId).ilike("name", pattern).limit(10),
    ]);

    if (evRes.data) {
      for (const e of evRes.data) {
        found.push({
          type: "event",
          title: e.title,
          subtitle: `${e.date} à ${e.time || ""}${(e.members as unknown as { name: string } | null)?.name ? ` · ${(e.members as unknown as { name: string }).name}` : ""}`,
          emoji: "📅",
          href: "/home",
          data: { date: e.date },
        });
      }
    }

    if (memRes.data) {
      for (const m of memRes.data) {
        found.push({ type: "member", title: m.name, subtitle: m.role, emoji: m.emoji || "👤", href: "/famille" });
      }
    }

    if (contRes.data) {
      for (const c of contRes.data) {
        found.push({ type: "contact", title: c.name, subtitle: `${c.relation} · ${c.phone}`, emoji: c.emoji || "📞", href: "/famille" });
      }
    }

    if (addrRes.data) {
      for (const a of addrRes.data) {
        found.push({ type: "address", title: a.name, subtitle: a.address || "Pas d'adresse", emoji: a.emoji || "📍", href: "/famille" });
      }
    }

    // Deduplicate notes (title + content searches)
    const noteIds = new Set<string>();
    const allNotes = [...(noteByTitle.data || []), ...(noteByContent.data || [])];
    for (const n of allNotes) {
      if (noteIds.has(n.id)) continue;
      noteIds.add(n.id);
      found.push({ type: "note", title: n.title, subtitle: n.content?.slice(0, 60) || "", emoji: "📝", href: "/vie" });
    }

    if (mealRes.data) {
      for (const m of mealRes.data) {
        found.push({ type: "meal", title: m.name, subtitle: `${m.date || ""} · ${m.type || ""}`, emoji: m.emoji || "🍽️", href: "/home" });
      }
    }

    if (choreRes.data) {
      for (const c of choreRes.data) {
        found.push({
          type: "chore",
          title: c.name,
          subtitle: c.done ? "Fait" : c.assigned_to || "Non assigné",
          emoji: c.emoji || "🧹",
          href: "/home",
        });
      }
    }

    setResults(found);
  }, [familyId]);

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  }

  function handleSelect(result: SearchResult) {
    if (result.type === "event" && result.data?.date) {
      localStorage.setItem("flowtime-goto-date", result.data.date);
    }
    onClose();
    router.push(result.href);
  }

  function handleQuickAction(href: string) {
    onClose();
    router.push(href);
  }

  function handleEventClick(date: string) {
    localStorage.setItem("flowtime-goto-date", date);
    onClose();
    router.push("/home");
  }

  function formatDateShort(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  }

  if (!open) return null;

  const typeLabels: Record<string, string> = {
    event: "Évènements",
    member: "Membres",
    contact: "Contacts",
    address: "Adresses",
    note: "Notes",
    meal: "Repas",
    chore: "Tâches ménagères",
  };

  const grouped: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!grouped[r.type]) grouped[r.type] = [];
    grouped[r.type].push(r);
  }

  const hasQuery = query.trim().length > 0;
  const showEmptyState = !hasQuery;

  function highlightMatch(text: string) {
    if (!hasQuery || !query.trim()) return text;
    const idx = text.toLowerCase().indexOf(query.trim().toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.trim().length);
    const after = text.slice(idx + query.trim().length);
    return <>{before}<span style={{ color: "var(--accent)", fontWeight: 700 }}>{match}</span>{after}</>;
  }

  return (
    <div
      className="fixed inset-0 z-[700] flex flex-col items-center"
      style={{ background: "var(--overlay)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full px-4"
        style={{ maxWidth: 430, paddingTop: "max(48px, calc(env(safe-area-inset-top, 0px) + 16px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 mb-4">
          <input
            ref={inputRef}
            className="flex-1 px-4 py-3 rounded-2xl text-sm"
            style={{
              background: "var(--surface2)",
              color: "var(--text)",
              border: "1px solid var(--glass-border)",
            }}
            placeholder="Rechercher partout..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
          />
          <button
            className="text-sm font-bold px-3 py-3 rounded-2xl"
            style={{ background: "var(--surface2)", color: "var(--dim)" }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content area */}
        <div className="max-h-[70vh] overflow-y-auto rounded-2xl" style={{ background: "var(--surface-solid)" }}>

          {/* === EMPTY STATE === */}
          {showEmptyState && (
            <div className="p-4 flex flex-col gap-4">

              {/* Weather widget */}
              {weatherData && (
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--surface2)" }}>
                  <span className="text-2xl">{weatherData.icon}</span>
                  <div>
                    <p className="text-sm font-bold">{weatherData.temp}°C</p>
                    <p className="text-[10px]" style={{ color: "var(--dim)" }}>Météo actuelle</p>
                  </div>
                </div>
              )}

              {/* Quick actions */}
              <div>
                <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--dim)" }}>
                  Actions rapides
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {QUICK_ACTIONS.map((a) => (
                    <button
                      key={a.label}
                      className="flex flex-col items-center gap-1 py-2.5 rounded-xl text-center transition-opacity hover:opacity-80"
                      style={{ background: "var(--surface2)" }}
                      onClick={() => handleQuickAction(a.href)}
                    >
                      <span className="text-lg">{a.emoji}</span>
                      <span className="text-[10px] font-bold" style={{ color: "var(--dim)" }}>{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Recent searches */}
              {recentSearches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>
                      Recherches récentes
                    </p>
                    <button
                      className="text-[10px] font-bold"
                      style={{ color: "var(--accent)" }}
                      onClick={() => { clearRecentSearches(); setRecentSearches([]); }}
                    >
                      Effacer
                    </button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {recentSearches.map((s) => (
                      <div key={s} className="flex items-center gap-2">
                        <button
                          className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-left text-sm transition-opacity hover:opacity-80"
                          style={{ background: "var(--surface2)" }}
                          onClick={() => { setQuery(s); search(s); }}
                        >
                          <span style={{ color: "var(--dim)" }}>🕐</span>
                          <span className="truncate">{s}</span>
                        </button>
                        <button
                          className="text-xs px-2 py-2 rounded-lg"
                          style={{ color: "var(--dim)" }}
                          onClick={() => { removeRecentSearch(s); setRecentSearches(getRecentSearches()); }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming events */}
              {upcomingEvents.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--dim)" }}>
                    Prochains évènements
                  </p>
                  <div className="flex flex-col gap-1">
                    {upcomingEvents.map((ev, i) => (
                      <button
                        key={i}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-opacity hover:opacity-80"
                        style={{ background: "var(--surface2)" }}
                        onClick={() => handleEventClick(ev.date)}
                      >
                        <span className="text-lg">{ev.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{ev.title}</p>
                          <p className="text-[10px]" style={{ color: "var(--dim)" }}>
                            {formatDateShort(ev.date)}{ev.time ? ` à ${ev.time}` : ""}
                          </p>
                        </div>
                        <span className="text-xs" style={{ color: "var(--accent)" }}>→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming birthdays */}
              {birthdays.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--dim)" }}>
                    Anniversaires proches
                  </p>
                  <div className="flex flex-col gap-1">
                    {birthdays.map((b, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                        style={{ background: "var(--surface2)" }}
                      >
                        <span className="text-lg">{b.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{b.name}</p>
                          <p className="text-[10px]" style={{ color: "var(--dim)" }}>
                            {b.daysLeft === 0 ? "Aujourd'hui !" : `Dans ${b.daysLeft} jour${b.daysLeft > 1 ? "s" : ""}`}
                          </p>
                        </div>
                        <span className="text-lg">🎂</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === SEARCH RESULTS === */}
          {hasQuery && results.length === 0 && (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">🔍</p>
              <p className="text-sm" style={{ color: "var(--dim)" }}>Aucun résultat</p>
            </div>
          )}

          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <p
                className="text-[10px] font-bold uppercase px-4 pt-3 pb-1"
                style={{ color: "var(--dim)" }}
              >
                {typeLabels[type] || type}
              </p>
              {items.map((r, i) => (
                <button
                  key={i}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition-opacity"
                  style={{ borderBottom: "1px solid var(--glass-border)" }}
                  onClick={() => handleSelect(r)}
                >
                  <span className="text-lg">{r.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{highlightMatch(r.title)}</p>
                    <p className="text-xs truncate" style={{ color: "var(--dim)" }}>{highlightMatch(r.subtitle)}</p>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
