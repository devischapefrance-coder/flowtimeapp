"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import FlowChat from "@/components/FlowChat";
import Timeline from "@/components/Timeline";
import DayAgenda from "@/components/DayAgenda";
import QuickVoice from "@/components/QuickVoice";
import NotificationManager from "@/components/NotificationManager";
import type { Event, Member, Address, Contact, Meal, Birthday, Expense, Chore, DeviceLocation } from "@/lib/types";
import Modal from "@/components/Modal";
import Logo from "@/components/Logo";
import { useRealtimeEvents, useRealtimeChores, useRealtimeMeals, useRealtimeBirthdays, useRealtimeMembers, useRealtimeExpenses } from "@/lib/realtime";
import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
const MapFull = dynamic(() => import("@/components/MapFull"), { ssr: false });
import { checkReminders, checkEventReminders } from "@/lib/reminders";
import { downloadICS, shareICS } from "@/lib/ical";
import { exportPDF } from "@/lib/pdf-export";
import { EVENT_CATEGORIES, getCategoryColor, detectCategory } from "@/lib/categories";
import { cacheData, getCachedData } from "@/lib/offline";
import { getWeatherWithGeolocation } from "@/lib/weather";
import { useToast } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";

// ---- Widget config types ----
interface WidgetConfig {
  id: string;
  visible: boolean;
}

const WIDGET_DEFS: { id: string; label: string; icon: string }[] = [
  { id: "stats", label: "Stats rapides", icon: "📊" },
  { id: "next_event", label: "Prochain event", icon: "⏭️" },
  { id: "flow", label: "Flow AI", icon: "🤖" },
  { id: "weather", label: "Météo", icon: "🌤️" },
  { id: "calendar", label: "Planning", icon: "📅" },
  { id: "meals", label: "Repas", icon: "🍽️" },
  { id: "expenses", label: "Dépenses", icon: "💰" },
  { id: "birthdays", label: "Anniversaires", icon: "🎂" },
  { id: "family_map", label: "Carte famille", icon: "🗺️" },
  { id: "chores", label: "Tâches", icon: "🧹" },
  { id: "activity", label: "Activité", icon: "📋" },
];

const DEFAULT_WIDGETS: WidgetConfig[] = WIDGET_DEFS.map((w) => ({ id: w.id, visible: true }));

const WIDGETS_STORAGE_KEY = "flowtime_home_widgets";

function loadWidgetConfig(): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(WIDGETS_STORAGE_KEY);
    if (!raw) return DEFAULT_WIDGETS;
    const parsed: WidgetConfig[] = JSON.parse(raw);
    // Ensure all widget IDs exist (handle new widgets added later)
    const existingIds = new Set(parsed.map((w) => w.id));
    const merged = [...parsed];
    for (const def of DEFAULT_WIDGETS) {
      if (!existingIds.has(def.id)) merged.push(def);
    }
    return merged.filter((w) => WIDGET_DEFS.some((d) => d.id === w.id));
  } catch {
    return DEFAULT_WIDGETS;
  }
}

function saveWidgetConfig(config: WidgetConfig[]) {
  localStorage.setItem(WIDGETS_STORAGE_KEY, JSON.stringify(config));
}

// Local date string (YYYY-MM-DD) — avoids UTC offset bugs from toISOString()
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---- Calendar helpers ----
function getWeekDays(dayOffset: number) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday + dayOffset);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = localDateStr(d);
    const todayStr = localDateStr(today);
    const isToday = dateStr === todayStr;
    days.push({
      date: dateStr,
      isToday,
      label: isToday ? "Aujourd'hui" : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
      dayName: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", year: "numeric" }),
    });
  }
  return days;
}

// Generate a continuous strip of days for the scrollable carousel
const STRIP_DAYS_BEFORE = 30;
const STRIP_DAYS_AFTER = 30;
function getDayStrip() {
  const today = new Date();
  const todayStr = localDateStr(today);
  const days = [];
  for (let i = -STRIP_DAYS_BEFORE; i <= STRIP_DAYS_AFTER; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = localDateStr(d);
    days.push({
      date: dateStr,
      isToday: dateStr === todayStr,
      offset: i,
      dayName: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    });
  }
  return days;
}

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const days: { date: string; dayNum: number; isCurrentMonth: boolean; isToday: boolean }[] = [];
  const todayStr = localDateStr(new Date());

  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: localDateStr(d), dayNum: d.getDate(), isCurrentMonth: false, isToday: localDateStr(d) === todayStr });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    const dateStr = localDateStr(d);
    days.push({ date: dateStr, dayNum: i, isCurrentMonth: true, isToday: dateStr === todayStr });
  }
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - startDow - lastDay.getDate() + 1);
    days.push({ date: localDateStr(d), dayNum: d.getDate(), isCurrentMonth: false, isToday: localDateStr(d) === todayStr });
  }
  return days;
}

function getGreeting(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

// ---- Weather type ----
interface WeatherData {
  temperature: number;
  weatherCode: number;
  description: string;
  icon: string;
}

export default function HomePage() {
  const { profile, chatUnread, openChat } = useProfile();
  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [devices, setDevices] = useState<DeviceLocation[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [mapFullOpen, setMapFullOpen] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [viewMode, setViewMode] = useState<"famille" | "perso">("famille");
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [isOffline, setIsOffline] = useState(false);
  const scrollStripRef = useRef<HTMLDivElement>(null);
  const scrollInitRef = useRef(false);

  // Live clock: updates every 30s
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date();
      const newDateStr = localDateStr(n);
      const oldDateStr = localDateStr(now);
      setNow(n);
      // At midnight, auto-move to the new day
      if (newDateStr !== oldDateStr) {
        setSelectedDate(newDateStr);
      }
    }, 30000); // every 30s
    return () => clearInterval(interval);
  }, []);

  // Month view state
  const [monthYear, setMonthYear] = useState(() => new Date().getFullYear());
  const [monthMonth, setMonthMonth] = useState(() => new Date().getMonth());
  const [monthEvents, setMonthEvents] = useState<Event[]>([]);

  // Meal state
  const [mealModal, setMealModal] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [mealName, setMealName] = useState("");
  const [mealType, setMealType] = useState<string>("dejeuner");
  const [mealEmoji, setMealEmoji] = useState("🍽️");

  // Quick event creation state
  const [quickEventModal, setQuickEventModal] = useState(false);
  const [qeTitle, setQeTitle] = useState("");
  const [qeTime, setQeTime] = useState("09:00");
  const [qeMember, setQeMember] = useState<string>("");
  const [qeCategory, setQeCategory] = useState("general");
  const [qeDescription, setQeDescription] = useState("");
  const [qeShared, setQeShared] = useState(true);
  const [qeReminder, setQeReminder] = useState<number | null>(null);
  const [qeRecurrence, setQeRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [qeConflict, setQeConflict] = useState<string | null>(null);
  const [viewType, setViewType] = useState<"timeline" | "agenda">("timeline");
  const { toast, toastUndo } = useToast();

  // Widget state
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);

  // Weather state
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // On mount: ensure selectedDate is today, then check goto-date override
  useEffect(() => {
    const todayLocal = localDateStr(new Date());
    setSelectedDate(todayLocal);
    const gotoDate = localStorage.getItem("flowtime-goto-date");
    if (gotoDate) {
      setSelectedDate(gotoDate);
      localStorage.removeItem("flowtime-goto-date");
    }
  }, []);

  // Compute week days around selected date for data fetching
  const selectedDateObj = new Date(selectedDate + "T00:00:00");
  const dayOfWeekSel = selectedDateObj.getDay();
  const diffToMondaySel = dayOfWeekSel === 0 ? -6 : 1 - dayOfWeekSel;
  const mondaySel = new Date(selectedDateObj);
  mondaySel.setDate(selectedDateObj.getDate() + diffToMondaySel);
  const todayStr = localDateStr(now);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mondaySel);
    d.setDate(mondaySel.getDate() + i);
    const dateStr = localDateStr(d);
    return {
      date: dateStr,
      isToday: dateStr === todayStr,
      label: dateStr === todayStr ? "Aujourd'hui" : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
      dayName: d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    };
  });
  const selectedDay = days.findIndex((d) => d.date === selectedDate);
  const currentDate = selectedDate;
  const dateDisplay = selectedDateObj.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const liveTime = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const dayStrip = getDayStrip();

  const weekMonthLabel = (() => {
    if (calendarView === "month") {
      const d = new Date(monthYear, monthMonth);
      return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    }
    const first = new Date(days[0].date);
    const last = new Date(days[6].date);
    const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    if (first.getMonth() === last.getMonth()) return fmt(first);
    return `${first.toLocaleDateString("fr-FR", { month: "short" })} — ${last.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}`;
  })();

  // Load widget config from localStorage
  useEffect(() => {
    setWidgetConfig(loadWidgetConfig());
  }, []);

  // Load weather
  useEffect(() => {
    getWeatherWithGeolocation(profile?.lat, profile?.lng).then((w) => {
      if (w) setWeather(w);
    });
  }, [profile?.lat, profile?.lng]);

  // Offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => { setIsOffline(false); loadData(); };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    if (!profile?.family_id) return;

    if (!navigator.onLine) {
      const cachedEvents = await getCachedData<Event>("events");
      const cachedMembers = await getCachedData<Member>("members");
      if (cachedEvents.length > 0) setEvents(cachedEvents);
      if (cachedMembers.length > 0) setMembers(cachedMembers);
      return;
    }

    const startDate = days[0].date;
    const endDate = days[6].date;

    // Month boundaries for expenses
    const nowLocal = new Date();
    const monthStart = localDateStr(new Date(nowLocal.getFullYear(), nowLocal.getMonth(), 1));
    const monthEnd = localDateStr(new Date(nowLocal.getFullYear(), nowLocal.getMonth() + 1, 0));

    const [evRes, memRes, addrRes, contRes, mealRes, bdayRes, expRes, choreRes, devRes] = await Promise.all([
      supabase
        .from("events")
        .select("*, members(name,emoji,color)")
        .eq("family_id", profile.family_id)
        .gte("date", startDate)
        .lte("date", endDate),
      supabase.from("members").select("*").eq("family_id", profile.family_id),
      supabase.from("addresses").select("*").eq("family_id", profile.family_id),
      supabase.from("contacts").select("*").eq("family_id", profile.family_id),
      supabase.from("meals").select("*").eq("family_id", profile.family_id)
        .gte("date", startDate)
        .lte("date", endDate),
      supabase.from("birthdays").select("*").eq("family_id", profile.family_id),
      supabase.from("expenses").select("*").eq("family_id", profile.family_id)
        .gte("date", monthStart)
        .lte("date", monthEnd),
      supabase.from("chores").select("*").eq("family_id", profile.family_id),
      supabase.from("device_locations").select("*").eq("family_id", profile.family_id),
    ]);
    if (evRes.data) {
      setEvents(evRes.data as Event[]);
      cacheData("events", evRes.data as Array<{ id: string } & Record<string, unknown>>);
    }
    if (memRes.data) {
      setMembers(memRes.data as Member[]);
      cacheData("members", memRes.data as Array<{ id: string } & Record<string, unknown>>);
    }
    if (addrRes.data) setAddresses(addrRes.data as Address[]);
    if (contRes.data) setContacts(contRes.data as Contact[]);
    if (mealRes.data) setMeals(mealRes.data as Meal[]);
    if (bdayRes.data) setBirthdays(bdayRes.data as Birthday[]);
    if (expRes.data) setExpenses(expRes.data as Expense[]);
    if (choreRes.data) setChores(choreRes.data as Chore[]);
    if (devRes.data) setDevices(devRes.data as DeviceLocation[]);
    setDataLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.family_id, selectedDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load month events when in month view
  useEffect(() => {
    if (calendarView !== "month" || !profile?.family_id) return;
    const firstDay = new Date(monthYear, monthMonth, 1);
    const lastDay = new Date(monthYear, monthMonth + 1, 0);
    const startDate = localDateStr(firstDay);
    const endDate = localDateStr(lastDay);
    supabase
      .from("events")
      .select("*, members(name,emoji,color)")
      .eq("family_id", profile.family_id)
      .gte("date", startDate)
      .lte("date", endDate)
      .then(({ data }) => {
        if (data) setMonthEvents(data as Event[]);
      });
  }, [calendarView, monthYear, monthMonth, profile?.family_id]);

  useRealtimeEvents(profile?.family_id, loadData);
  useRealtimeChores(profile?.family_id, loadData);
  useRealtimeMeals(profile?.family_id, loadData);
  useRealtimeBirthdays(profile?.family_id, loadData);
  useRealtimeMembers(profile?.family_id, loadData);
  useRealtimeExpenses(profile?.family_id, loadData);

  // Polling fallback: refresh every 10s
  useEffect(() => {
    if (!profile?.family_id) return;
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [profile?.family_id, loadData]);

  // Scroll day strip to selected date
  useEffect(() => {
    if (!selectedDate || !scrollStripRef.current) return;
    // Small delay to ensure DOM is painted with the day strip
    const raf = requestAnimationFrame(() => {
      if (!scrollStripRef.current) return;
      const el = scrollStripRef.current.querySelector(`[data-date="${selectedDate}"]`) as HTMLElement | null;
      if (el) {
        const container = scrollStripRef.current;
        const scrollLeft = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
        if (!scrollInitRef.current) {
          // First render: jump instantly
          container.scrollLeft = scrollLeft;
          scrollInitRef.current = true;
        } else {
          container.scrollTo({ left: scrollLeft, behavior: "smooth" });
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedDate]);

  // Proactive reminders check every minute
  useEffect(() => {
    function check() {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const reminder = checkReminders(
        events.map((e) => ({ title: e.title, time: e.time, date: e.date })),
        profile?.first_name || ""
      );
      if (reminder) {
        new Notification(reminder.title, { body: reminder.body, icon: "/icons/icon-192.png" });
      }
      const eventReminder = checkEventReminders(
        events.map((e) => ({ id: e.id, title: e.title, time: e.time, date: e.date, reminder_minutes: e.reminder_minutes }))
      );
      if (eventReminder) {
        new Notification(eventReminder.title, { body: eventReminder.body, icon: "/icons/icon-192.png" });
      }
    }
    check();
    const interval = setInterval(check, 60 * 1000);
    return () => clearInterval(interval);
  }, [events, profile?.first_name]);

  function handleExport() {
    if (typeof navigator !== "undefined" && "canShare" in navigator) {
      shareICS(events);
    } else {
      downloadICS(events);
    }
  }

  const myMember = members.find((m) => m.name.toLowerCase() === (profile?.first_name || "").toLowerCase());

  const viewEvents = viewMode === "perso" && myMember
    ? events.filter((e) => e.member_id === myMember.id)
    : viewMode === "perso" && !myMember
      ? []
      : events.filter((e) => e.shared !== false || (myMember && e.member_id === myMember.id));

  const dayEvents = viewEvents.filter((e) => e.date === currentDate);
  const filteredEvents = filter
    ? dayEvents.filter((e) => e.member_id === filter)
    : dayEvents;

  const eventCounts: Record<string, number> = {};
  for (const ev of viewEvents) {
    eventCounts[ev.date] = (eventCounts[ev.date] || 0) + 1;
  }

  const dayCategoryColors: Record<string, string> = {};
  for (const date of Object.keys(eventCounts)) {
    const dayEvs = viewEvents.filter((e) => e.date === date);
    const catCount: Record<string, number> = {};
    for (const e of dayEvs) {
      const cat = e.category || "general";
      catCount[cat] = (catCount[cat] || 0) + 1;
    }
    const dominant = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];
    dayCategoryColors[date] = dominant ? getCategoryColor(dominant[0]) : getCategoryColor("general");
  }

  const monthEventsByDay: Record<string, Event[]> = {};
  const viewMonthEvents = viewMode === "perso" && myMember
    ? monthEvents.filter((e) => e.member_id === myMember.id)
    : viewMode === "perso" && !myMember
      ? []
      : monthEvents;
  for (const ev of viewMonthEvents) {
    if (!monthEventsByDay[ev.date]) monthEventsByDay[ev.date] = [];
    monthEventsByDay[ev.date].push(ev);
  }

  const todayEvents = viewEvents.filter((e) => e.date === todayStr);

  const nextEvent = dayEvents
    .filter((e) => {
      if (!e.time) return false;
      const [h, m] = e.time.split(":").map(Number);
      return h * 60 + m > now.getHours() * 60 + now.getMinutes();
    })
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""))[0];

  // Conflict detection
  function checkConflict(time: string, date: string): string | null {
    if (!time) return null;
    const [h, m] = time.split(":").map(Number);
    const mins = h * 60 + m;
    const dayEvs = events.filter((e) => e.date === date && e.time);
    for (const e of dayEvs) {
      const [eh, em] = e.time!.split(":").map(Number);
      const eMins = eh * 60 + em;
      if (Math.abs(mins - eMins) < 30) {
        return `Conflit possible avec "${e.title}" à ${e.time}`;
      }
    }
    return null;
  }

  async function deleteEvent(id: string) {
    const ev = events.find((e) => e.id === id);
    await supabase.from("events").delete().eq("id", id);
    loadData();
    if (ev) {
      toastUndo(`"${ev.title}" supprimé`, async () => {
        const { id: _id, members: _m, ...rest } = ev as unknown as Record<string, unknown>;
        void _id; void _m;
        await supabase.from("events").insert(rest);
        loadData();
      });
    }
  }

  async function deleteEventSeries(ev: Event) {
    if (!profile?.family_id || !ev.recurring) return;
    if (!confirm("Supprimer toute la série ?")) return;
    const { data } = await supabase
      .from("events")
      .select("id")
      .eq("family_id", profile.family_id)
      .eq("title", ev.title)
      .eq("member_id", ev.member_id);
    if (data) {
      const ids = data.map((e: { id: string }) => e.id);
      for (const id of ids) {
        await supabase.from("events").delete().eq("id", id);
      }
    }
    loadData();
  }

  function resolveMemberId(memberName?: string): string | null {
    if (!memberName) return null;
    const mem = members.find((m) => m.name.toLowerCase() === memberName.toLowerCase());
    return mem?.id || null;
  }

  function resolveFlowMemberId(memberName?: string): string | null {
    const resolved = resolveMemberId(memberName);
    if (resolved) return resolved;
    if (viewMode === "perso" && myMember) return myMember.id;
    return null;
  }

  async function handleFlowAction(action: { type: string; data: Record<string, unknown> }) {
    if (!profile?.family_id) return;

    if (action.type === "add_event") {
      const title = action.data.title as string;
      await supabase.from("events").insert({
        family_id: profile.family_id,
        title,
        time: action.data.time,
        date: action.data.date || currentDate,
        member_id: resolveFlowMemberId(action.data.member_name as string),
        description: action.data.description || "",
        category: (action.data.category as string) || detectCategory(title),
        shared: action.data.shared !== false,
      });
    } else if (action.type === "delete_event") {
      await supabase.from("events").delete().eq("id", action.data.event_id);
    } else if (action.type === "edit_event") {
      const title = (action.data.title as string) || "";
      await supabase.from("events").delete().eq("id", action.data.event_id);
      await supabase.from("events").insert({
        family_id: profile.family_id,
        title,
        time: action.data.time,
        date: action.data.date || currentDate,
        member_id: resolveFlowMemberId(action.data.member_name as string),
        description: action.data.description || "",
        category: (action.data.category as string) || detectCategory(title),
        shared: action.data.shared !== false,
      });
    } else if (action.type === "add_recurring") {
      const memberId = resolveFlowMemberId(action.data.member_name as string);
      const recurringDays = action.data.days as number[];
      const title = action.data.title as string;
      const category = (action.data.category as string) || detectCategory(title);
      const startDate = new Date();
      for (let week = 0; week < 4; week++) {
        for (const day of recurringDays) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7) + week * 7);
          await supabase.from("events").insert({
            family_id: profile.family_id,
            title,
            time: action.data.time_start,
            date: localDateStr(d),
            member_id: memberId,
            recurring: { days: recurringDays, time_start: action.data.time_start, time_end: action.data.time_end },
            category,
          });
        }
      }
    }
    loadData();
  }

  // --- Quick event creation ---
  function openQuickEvent() {
    setQeTitle("");
    setQeTime("09:00");
    setQeMember(viewMode === "perso" && myMember ? myMember.id : "");
    setQeCategory("general");
    setQeDescription("");
    setQeShared(true);
    setQeReminder(null);
    setQeRecurrence("none");
    setQeConflict(null);
    setQuickEventModal(true);
  }

  async function saveQuickEvent() {
    if (!profile?.family_id || !qeTitle.trim() || !qeTime) return;
    const category = qeCategory === "general" ? detectCategory(qeTitle) : qeCategory;
    const baseEvent = {
      family_id: profile.family_id,
      title: qeTitle.trim(),
      time: qeTime,
      member_id: qeMember || null,
      description: qeDescription.trim(),
      category,
      shared: qeShared,
      reminder_minutes: qeReminder,
    };

    if (qeRecurrence === "none") {
      await supabase.from("events").insert({ ...baseEvent, date: currentDate });
      toast(`"${qeTitle.trim()}" ajouté`, "success");
    } else {
      // Generate recurring events for 4 weeks
      const dates: string[] = [];
      const start = new Date(currentDate + "T00:00:00");
      for (let i = 0; i < (qeRecurrence === "daily" ? 28 : qeRecurrence === "weekly" ? 4 : 3); i++) {
        const d = new Date(start);
        if (qeRecurrence === "daily") d.setDate(start.getDate() + i);
        else if (qeRecurrence === "weekly") d.setDate(start.getDate() + i * 7);
        else d.setMonth(start.getMonth() + i);
        dates.push(localDateStr(d));
      }
      for (const date of dates) {
        await supabase.from("events").insert({ ...baseEvent, date, recurring: { type: qeRecurrence } });
      }
      toast(`${dates.length} évènements récurrents créés`, "success");
    }
    setQuickEventModal(false);
    loadData();
  }

  // --- Meal CRUD ---
  const MEAL_TYPES = [
    { value: "petit-dejeuner", label: "Petit-dej", emoji: "🍳" },
    { value: "dejeuner", label: "Déjeuner", emoji: "🥗" },
    { value: "diner", label: "Dîner", emoji: "🍝" },
  ];

  const dayMeals = meals.filter((m) => m.date === currentDate);

  function openNewMeal(type: string) {
    setEditingMeal(null);
    setMealName("");
    setMealType(type);
    setMealEmoji(MEAL_TYPES.find((t) => t.value === type)?.emoji || "🍽️");
    setMealModal(true);
  }

  function openEditMeal(m: Meal) {
    setEditingMeal(m);
    setMealName(m.name);
    setMealType(m.meal_type);
    setMealEmoji(m.emoji);
    setMealModal(true);
  }

  async function saveMeal() {
    if (!profile?.family_id || !mealName.trim()) return;
    if (editingMeal) {
      await supabase.from("meals").update({
        name: mealName.trim(),
        meal_type: mealType,
        emoji: mealEmoji,
      }).eq("id", editingMeal.id);
    } else {
      await supabase.from("meals").insert({
        family_id: profile.family_id,
        date: currentDate,
        meal_type: mealType,
        name: mealName.trim(),
        emoji: mealEmoji,
      });
    }
    setMealModal(false);
    loadData();
  }

  async function deleteMeal(id: string) {
    await supabase.from("meals").delete().eq("id", id);
    loadData();
  }

  // Month navigation
  function prevMonth() {
    if (monthMonth === 0) { setMonthMonth(11); setMonthYear(monthYear - 1); }
    else setMonthMonth(monthMonth - 1);
  }
  function nextMonth() {
    if (monthMonth === 11) { setMonthMonth(0); setMonthYear(monthYear + 1); }
    else setMonthMonth(monthMonth + 1);
  }

  function selectMonthDay(dateStr: string) {
    setSelectedDate(dateStr);
    setCalendarView("week");
  }

  // ---- Widget config helpers ----
  function toggleWidgetVisibility(id: string) {
    const newConfig = widgetConfig.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
    );
    setWidgetConfig(newConfig);
    saveWidgetConfig(newConfig);
  }

  function moveWidget(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= widgetConfig.length) return;
    const newConfig = [...widgetConfig];
    [newConfig[idx], newConfig[target]] = [newConfig[target], newConfig[idx]];
    setWidgetConfig(newConfig);
    saveWidgetConfig(newConfig);
  }

  // ---- Computed data for widgets ----
  const totalWeekEvents = viewEvents.length;

  // Expenses: total + top 3 categories
  const expenseTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expenseByCategory: Record<string, number> = {};
  for (const e of expenses) {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount;
  }
  const topExpenseCategories = Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Birthdays: next 3
  const upcomingBirthdays = (() => {
    const today = new Date();
    const thisYear = today.getFullYear();
    return birthdays
      .map((b) => {
        const [, m, d] = b.date.split("-").map(Number);
        let nextBday = new Date(thisYear, m - 1, d);
        if (nextBday < today) nextBday = new Date(thisYear + 1, m - 1, d);
        const daysUntil = Math.ceil((nextBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { ...b, daysUntil, nextBday };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 3);
  })();

  const monthDays = calendarView === "month" ? getMonthDays(monthYear, monthMonth) : [];

  const flowContext = {
    userName: profile?.first_name,
    members: members.map((m) => ({ name: m.name, role: m.role, emoji: m.emoji })),
    todayEvents: dayEvents.map((e) => ({ id: e.id, title: e.title, time: e.time, date: e.date, member: e.members?.name, category: e.category })),
    weekEvents: viewEvents.map((e) => ({ id: e.id, title: e.title, time: e.time, date: e.date, member: e.members?.name, category: e.category })),
    addresses: addresses.map((a) => ({ name: a.name, address: a.address })),
    contacts: contacts.map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
    selectedDate: currentDate,
    selectedDayName: dateDisplay,
    today: todayStr,
    currentTime: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    viewMode,
  };

  // ---- Widget render functions ----
  function renderWidget(widgetId: string) {
    switch (widgetId) {
      case "stats": return renderStats();
      case "next_event": return renderNextEvent();
      case "flow": return renderFlow();
      case "weather": return renderWeather();
      case "calendar": return renderCalendar();
      case "meals": return renderMeals();
      case "expenses": return renderExpenses();
      case "birthdays": return renderBirthdays();
      case "family_map": return renderFamilyMap();
      case "chores": return renderChores();
      case "activity": return renderActivity();
      default: return null;
    }
  }

  function renderStats() {
    return (
      <div className="grid grid-cols-2 gap-2">
        <div className="card !mb-0 text-center !py-3">
          <p className="text-lg font-bold" style={{ color: "var(--accent)" }}>{todayEvents.length}</p>
          <p className="text-[10px]" style={{ color: "var(--dim)" }}>Aujourd&apos;hui</p>
        </div>
        <div className="card !mb-0 text-center !py-3">
          <p className="text-lg font-bold" style={{ color: "var(--teal)" }}>{totalWeekEvents}</p>
          <p className="text-[10px]" style={{ color: "var(--dim)" }}>Cette semaine</p>
        </div>
      </div>
    );
  }

  function renderNextEvent() {
    if (!nextEvent) return null;
    return (
      <div
        className="card flex items-center gap-3 !mb-0"
        style={{ borderLeft: `3px solid ${getCategoryColor(nextEvent.category)}` }}
      >
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--accent)" }}>Prochain</p>
          <p className="text-sm font-bold mt-0.5">{nextEvent.title}</p>
          <p className="text-xs" style={{ color: "var(--dim)" }}>{nextEvent.time}{nextEvent.members ? ` · ${nextEvent.members.name}` : ""}</p>
        </div>
        <span className="text-2xl">{nextEvent.members?.emoji || "📅"}</span>
      </div>
    );
  }

  function renderFlow() {
    return (
      <div
        className="card flex items-center gap-3 !mb-0 cursor-pointer"
        style={{ background: "var(--accent-soft)", border: "1px solid rgba(124,107,240,0.15)" }}
        onClick={() => setChatOpen(true)}
      >
        <div
          className="w-11 h-11 flex items-center justify-center rounded-full text-xl"
          style={{ background: "linear-gradient(135deg, var(--accent), #9B8BFF)" }}
        >
          <Logo size={24} />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-bold">Flow</p>
          <p className="text-[11px]" style={{ color: "var(--dim)" }}>Demande-moi n&apos;importe quoi</p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--green)", color: "#fff" }}>En ligne</span>
      </div>
    );
  }

  function renderWeather() {
    if (!weather) {
      return (
        <div className="card !mb-0 flex items-center gap-3">
          <span className="text-2xl">🌡️</span>
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Météo</p>
            <p className="text-xs" style={{ color: "var(--faint)" }}>Chargement...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="card !mb-0 flex items-center gap-3">
        <span className="text-3xl">{weather.icon}</span>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Météo</p>
          <p className="text-lg font-bold">{weather.temperature}°C</p>
          <p className="text-xs" style={{ color: "var(--dim)" }}>{weather.description}</p>
        </div>
      </div>
    );
  }

  function renderCalendar() {
    return (
      <>
        {/* Calendar header */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-2 px-1">
            {calendarView === "month" && (
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: "var(--surface2)", color: "var(--text)" }}
                onClick={prevMonth}
              >‹</button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold capitalize" style={{ color: "var(--dim)" }}>{weekMonthLabel}</span>
              {calendarView === "week" && selectedDate !== todayStr && (
                <button
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                  onClick={() => setSelectedDate(todayStr)}
                >Aujourd&apos;hui</button>
              )}
              <button
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                style={{ background: "var(--surface2)", color: "var(--dim)" }}
                onClick={() => {
                  if (calendarView === "week") {
                    const d = new Date(selectedDate);
                    setMonthYear(d.getFullYear());
                    setMonthMonth(d.getMonth());
                    setCalendarView("month");
                  } else setCalendarView("week");
                }}
                title={calendarView === "week" ? "Vue mois" : "Vue semaine"}
              >{calendarView === "week" ? "📅" : "📋"}</button>
            </div>
            {calendarView === "month" && (
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: "var(--surface2)", color: "var(--text)" }}
                onClick={nextMonth}
              >›</button>
            )}
          </div>

          {/* Week view */}
          {calendarView === "week" && (
            <div
              ref={scrollStripRef}
              className="flex gap-1 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory" }}
            >
              {dayStrip.map((d) => {
                const date = new Date(d.date);
                const dayNum = date.getDate();
                const dayLetter = date.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 1).toUpperCase();
                const isSelected = d.date === selectedDate;
                const count = eventCounts[d.date] || 0;
                const dotColor = dayCategoryColors[d.date] || "var(--accent)";
                // Show month label on 1st of month
                const showMonth = dayNum === 1;
                return (
                  <button
                    key={d.date}
                    data-date={d.date}
                    className="flex flex-col items-center shrink-0 rounded-2xl"
                    style={{
                      width: 46,
                      padding: "8px 0",
                      background: isSelected ? "var(--accent)" : "transparent",
                      boxShadow: isSelected ? "0 4px 16px var(--accent-glow)" : "none",
                      scrollSnapAlign: "center",
                      transition: "background 0.15s, box-shadow 0.15s",
                    }}
                    onClick={() => setSelectedDate(d.date)}
                  >
                    <span className="text-[10px] font-bold" style={{ color: isSelected ? "#fff" : "var(--faint)" }}>
                      {showMonth ? date.toLocaleDateString("fr-FR", { month: "short" }).slice(0, 3) : dayLetter}
                    </span>
                    <span className="text-base font-bold mt-0.5" style={{ color: isSelected ? "#fff" : d.isToday ? "var(--accent)" : "var(--text)" }}>{dayNum}</span>
                    {count > 0 && <span className="w-1.5 h-1.5 rounded-full mt-1" style={{ background: isSelected ? "#fff" : dotColor }} />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Month view */}
          {calendarView === "month" && (
            <div>
              <div className="grid grid-cols-7 gap-0.5 mb-1">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
                  <div key={d} className="text-center text-[10px] font-bold py-1" style={{ color: "var(--faint)" }}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {monthDays.map((d, i) => {
                  const dayEvs = monthEventsByDay[d.date] || [];
                  const catColors: string[] = [];
                  const seenCats = new Set<string>();
                  for (const e of dayEvs) {
                    const cat = e.category || "general";
                    if (!seenCats.has(cat)) { seenCats.add(cat); catColors.push(getCategoryColor(cat)); }
                    if (catColors.length >= 3) break;
                  }
                  return (
                    <button key={i} className="flex flex-col items-center py-1.5 rounded-xl transition-all"
                      style={{ background: d.isToday ? "var(--accent)" : "transparent", opacity: d.isCurrentMonth ? 1 : 0.3 }}
                      onClick={() => selectMonthDay(d.date)}
                    >
                      <span className="text-xs font-bold" style={{ color: d.isToday ? "#fff" : "var(--text)" }}>{d.dayNum}</span>
                      {catColors.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {catColors.map((c, ci) => <span key={ci} className="w-1 h-1 rounded-full" style={{ background: d.isToday ? "#fff" : c }} />)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Member filters */}
        {viewMode === "famille" && members.length > 0 && (
          <div className="flex justify-center gap-3 mb-3">
            <button className="flex flex-col items-center gap-1 transition-opacity" style={{ opacity: !filter ? 1 : 0.35 }} onClick={() => setFilter(null)}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                style={{ background: !filter ? "var(--accent-soft)" : "var(--surface2)", outline: !filter ? "2px solid var(--accent)" : "none", outlineOffset: 2 }}>👥</div>
              <span className="text-[9px] font-bold" style={{ color: !filter ? "var(--accent)" : "var(--dim)" }}>Tous</span>
            </button>
            {members.map((m) => {
              const active = filter === m.id;
              return (
                <button key={m.id} className="flex flex-col items-center gap-1 transition-opacity" style={{ opacity: active ? 1 : 0.35 }} onClick={() => setFilter(active ? null : m.id)}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                    style={{ background: "var(--surface2)", outline: active ? `2px solid ${m.color}` : "none", outlineOffset: 2 }}>{m.emoji}</div>
                  <span className="text-[9px] font-bold" style={{ color: active ? m.color : "var(--dim)" }}>{m.name.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Timeline / Agenda toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="label !mb-0">{selectedDate === todayStr ? "Planning du jour" : `Planning — ${selectedDateObj.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}`}</p>
            <div className="flex gap-0.5 p-0.5 rounded-lg mb-2" style={{ background: "var(--surface2)" }}>
              <button className="px-2 py-1 rounded-md text-[10px] font-bold"
                style={{ background: viewType === "timeline" ? "var(--accent)" : "transparent", color: viewType === "timeline" ? "#fff" : "var(--dim)" }}
                onClick={() => setViewType("timeline")}>Liste</button>
              <button className="px-2 py-1 rounded-md text-[10px] font-bold"
                style={{ background: viewType === "agenda" ? "var(--accent)" : "transparent", color: viewType === "agenda" ? "#fff" : "var(--dim)" }}
                onClick={() => setViewType("agenda")}>Agenda</button>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm mb-2"
              style={{ background: "var(--surface2)", color: "var(--dim)" }}
              onClick={() => { exportPDF(viewEvents, days[0].date, days[6].date); }}
              title="Exporter PDF">📄</button>
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-lg mb-2"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={openQuickEvent} title="Ajouter un évènement">+</button>
          </div>
        </div>

        {viewType === "timeline" ? (
          <Timeline events={filteredEvents} allEvents={dayEvents} onDelete={deleteEvent} onDeleteSeries={deleteEventSeries}
            onReorder={async (eventId, newTime) => { await supabase.from("events").update({ time: newTime }).eq("id", eventId); loadData(); }} />
        ) : (
          <DayAgenda events={filteredEvents} onDelete={deleteEvent}
            onReorder={async (eventId, newTime) => { await supabase.from("events").update({ time: newTime }).eq("id", eventId); loadData(); }} />
        )}

        {filteredEvents.length === 0 && (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm" style={{ color: "var(--dim)" }}>Aucun évènement {selectedDate === todayStr ? "aujourd'hui" : "ce jour"}</p>
            <button className="text-xs font-bold mt-2" style={{ color: "var(--accent)" }} onClick={openQuickEvent}>+ Ajouter un évènement</button>
          </div>
        )}
      </>
    );
  }

  function renderMeals() {
    return (
      <div>
        <p className="label">🍽️ Repas {selectedDate === todayStr ? "du jour" : `— ${selectedDateObj.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}`}</p>
        <div className="flex flex-col gap-2">
          {MEAL_TYPES.map((type) => {
            const meal = dayMeals.find((m) => m.meal_type === type.value);
            return (
              <div key={type.value} className="card !mb-0 flex items-center gap-3 cursor-pointer"
                onClick={() => meal ? openEditMeal(meal) : openNewMeal(type.value)}>
                <span className="text-xl">{meal ? meal.emoji : type.emoji}</span>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>{type.label}</p>
                  {meal ? <p className="text-sm font-bold">{meal.name}</p> : <p className="text-xs" style={{ color: "var(--faint)" }}>Pas encore défini</p>}
                </div>
                {meal ? (
                  <button className="text-xs p-1 rounded-full" style={{ color: "var(--red, #ef4444)" }}
                    onClick={(e) => { e.stopPropagation(); deleteMeal(meal.id); }}>🗑️</button>
                ) : <span className="text-lg" style={{ color: "var(--accent)" }}>+</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderExpenses() {
    return (
      <div className="card !mb-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Dépenses du mois</p>
          <p className="text-lg font-bold" style={{ color: "var(--warm)" }}>{expenseTotal.toFixed(0)} €</p>
        </div>
        {topExpenseCategories.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {topExpenseCategories.map(([cat, amount]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-xs capitalize" style={{ color: "var(--dim)" }}>{cat}</span>
                <span className="text-xs font-bold">{amount.toFixed(0)} €</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--faint)" }}>Aucune depense ce mois</p>
        )}
      </div>
    );
  }

  function renderBirthdays() {
    return (
      <div className="card !mb-0">
        <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--dim)" }}>Prochains anniversaires</p>
        {upcomingBirthdays.length > 0 ? (
          <div className="flex flex-col gap-2">
            {upcomingBirthdays.map((b) => (
              <div key={b.id} className="flex items-center gap-3">
                <span className="text-xl">{b.emoji || "🎂"}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold">{b.name}</p>
                  <p className="text-[10px]" style={{ color: "var(--dim)" }}>
                    {b.daysUntil === 0
                      ? "Aujourd'hui !"
                      : b.daysUntil === 1
                        ? "Demain"
                        : `Dans ${b.daysUntil} jours`}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
                  background: b.daysUntil <= 7 ? "rgba(240,107,126,0.15)" : "var(--surface2)",
                  color: b.daysUntil <= 7 ? "var(--red)" : "var(--dim)",
                }}>{b.nextBday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--faint)" }}>Aucun anniversaire enregistre</p>
        )}
      </div>
    );
  }

  function renderFamilyMap() {
    const mapMarkers: MapMarker[] = [
      ...devices.map((d) => ({
        id: d.id,
        lat: d.lat,
        lng: d.lng,
        emoji: d.emoji || "📱",
        name: d.device_name,
        type: "device" as const,
        detail: new Date(d.updated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      })),
      ...addresses.filter((a) => a.lat && a.lng).map((a) => ({
        id: a.id,
        lat: a.lat!,
        lng: a.lng!,
        emoji: a.emoji || "📍",
        name: a.name,
        type: "address" as const,
      })),
    ];
    const center: [number, number] = devices.length > 0
      ? [devices[0].lat, devices[0].lng]
      : profile?.lat && profile?.lng
        ? [profile.lat, profile.lng]
        : [46.6, 2.5];
    return (
      <>
        <div className="card !mb-0 block cursor-pointer" style={{ position: "relative", zIndex: 1 }} onClick={() => setMapFullOpen(true)}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Carte famille</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
              {devices.length} appareil{devices.length !== 1 ? "s" : ""} · Voir →
            </span>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ height: 180, pointerEvents: "none" }}>
            <MapView
              markers={mapMarkers}
              center={center}
              zoom={mapMarkers.length > 0 ? 12 : 6}
              height="180px"
              mapStyle="dark"
              interactive={false}
            />
          </div>
        </div>
        {mapFullOpen && (
          <MapFull
            markers={mapMarkers.filter((m) => m.type === "address")}
            deviceMarkers={mapMarkers.filter((m) => m.type === "device")}
            center={center}
            onClose={() => setMapFullOpen(false)}
          />
        )}
      </>
    );
  }

  async function completeChore(choreId: string, currentIndex: number) {
    await supabase.from("chores").update({ current_index: currentIndex + 1, last_rotated: localDateStr(new Date()) }).eq("id", choreId);
    loadData();
  }

  function renderChores() {
    const displayChores = chores.slice(0, 3);
    const freqLabel = (f: string) => f === "daily" ? "Quotidien" : "Hebdo";
    return (
      <div className="card !mb-0">
        <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--dim)" }}>Tâches ménagères</p>
        {displayChores.length > 0 ? (
          <div className="flex flex-col gap-2">
            {displayChores.map((ch) => {
              const assignedMember = ch.assigned_members.length > 0
                ? members.find((m) => m.id === ch.assigned_members[ch.current_index % ch.assigned_members.length])
                : null;
              return (
                <div key={ch.id} className="flex items-center gap-3">
                  <button
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 active:scale-90 transition-all"
                    style={{ background: "rgba(94,200,158,0.12)", color: "var(--green)" }}
                    onClick={() => completeChore(ch.id, ch.current_index)}
                    title="Marquer comme fait"
                  >
                    ✓
                  </button>
                  <span className="text-xl">{ch.emoji || "🧹"}</span>
                  <div className="flex-1">
                    <p className="text-sm font-bold">{ch.name}</p>
                    <p className="text-[10px]" style={{ color: "var(--dim)" }}>
                      {assignedMember ? `${assignedMember.emoji} ${assignedMember.name}` : "Non assigné"}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
                    {freqLabel(ch.frequency)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon="🧹" title="Aucune tâche configurée" subtitle="Ajoute des tâches dans Vie de famille" />
        )}
      </div>
    );
  }

  function renderActivity() {
    // Build activity feed from recent events, chores, and expenses
    const activities: { emoji: string; text: string; time: string; key: string }[] = [];

    // Recent events created (today or selected date)
    for (const ev of events.filter((e) => e.date === currentDate).slice(0, 5)) {
      const mem = ev.member_id ? members.find((m) => m.id === ev.member_id) : null;
      activities.push({
        emoji: "📅",
        text: `${mem ? mem.name : "Famille"} — ${ev.title}`,
        time: ev.time || "",
        key: `ev-${ev.id}`,
      });
    }

    // Recent chore completions
    for (const ch of chores.filter((c) => c.last_rotated === todayStr).slice(0, 3)) {
      const mem = ch.assigned_members.length > 0
        ? members.find((m) => m.id === ch.assigned_members[(ch.current_index - 1 + ch.assigned_members.length) % ch.assigned_members.length])
        : null;
      activities.push({
        emoji: "✅",
        text: `${mem?.name || "Quelqu'un"} a fait "${ch.name}"`,
        time: "",
        key: `ch-${ch.id}`,
      });
    }

    // Recent expenses
    for (const exp of expenses.slice(0, 3)) {
      const mem = exp.member_id ? members.find((m) => m.id === exp.member_id) : null;
      activities.push({
        emoji: "💰",
        text: `${mem?.name || "Famille"} — ${exp.description} (${Number(exp.amount).toFixed(0)}€)`,
        time: exp.date || "",
        key: `exp-${exp.id}`,
      });
    }

    return (
      <div className="card !mb-0">
        <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--dim)" }}>Activité récente</p>
        {activities.length > 0 ? (
          <div className="flex flex-col gap-2">
            {activities.slice(0, 6).map((a) => (
              <div key={a.key} className="flex items-center gap-2.5">
                <span className="text-base">{a.emoji}</span>
                <p className="text-xs flex-1 truncate">{a.text}</p>
                {a.time && <span className="text-[10px] shrink-0" style={{ color: "var(--dim)" }}>{a.time}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--faint)" }}>Rien à afficher pour le moment</p>
        )}
      </div>
    );
  }

  return (
    <div
      className="px-4 py-4 animate-in gradient-bg"
      style={{ paddingBottom: 200 }}
    >
      {/* Offline banner */}
      {isOffline && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-bold text-center" style={{ background: "rgba(240,124,74,0.15)", color: "var(--warm)", border: "1px solid rgba(240,124,74,0.2)" }}>
          📡 Hors ligne — données en cache
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{getGreeting(now)}, {profile?.first_name}</h1>
          <p className="text-sm capitalize mt-0.5" style={{ color: "var(--dim)" }}>{dateDisplay} · {liveTime}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-sm relative"
            style={{ background: "var(--surface2)" }} onClick={() => openChat()} aria-label="Chat famille" title="Chat famille">
            💬
            {chatUnread > 0 && (
              <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: "var(--red)" }}>
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </button>
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-sm"
            style={{ background: "var(--surface2)" }} onClick={handleExport} aria-label="Exporter" title="Exporter le calendrier">📤</button>
          <Link href="/reglages" className="w-11 h-11 rounded-full flex items-center justify-center text-xl overflow-hidden active:scale-90 transition-transform"
            style={{ background: "var(--surface2)" }}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="Profil" className="w-full h-full object-cover" /> : profile?.emoji || "👤"}
          </Link>
        </div>
      </div>

      {/* Toggle perso / famille */}
      <div className="flex gap-1 mt-5 p-1 rounded-2xl" style={{ background: "var(--surface2)" }}>
        <button className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: viewMode === "famille" ? "var(--accent)" : "transparent", color: viewMode === "famille" ? "#fff" : "var(--dim)" }}
          onClick={() => { setViewMode("famille"); setFilter(null); }}>👨‍👩‍👧‍👦 Famille</button>
        <button className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: viewMode === "perso" ? "var(--accent)" : "transparent", color: viewMode === "perso" ? "#fff" : "var(--dim)" }}
          onClick={() => { setViewMode("perso"); setFilter(null); }}>👤 Mon planning</button>
      </div>

      {/* Widgets */}
      <div className="flex flex-col gap-3 mt-3">
        {!dataLoaded ? (
          <>
            {[1,2,3].map((i) => (
              <div key={i} className="card animate-pulse" style={{ height: 80 }}>
                <div className="h-3 w-24 rounded-full mb-3" style={{ background: "var(--surface2)" }} />
                <div className="h-3 w-full rounded-full mb-2" style={{ background: "var(--surface2)" }} />
                <div className="h-3 w-2/3 rounded-full" style={{ background: "var(--surface2)" }} />
              </div>
            ))}
          </>
        ) : widgetConfig.map((w) => {
          if (!w.visible) return null;
          const content = renderWidget(w.id);
          if (!content) return null;
          return <div key={w.id}>{content}</div>;
        })}

        {/* Edit widgets button */}
        <button
          className="mx-auto mt-1 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
          style={{ background: "var(--surface2)", color: "var(--dim)" }}
          onClick={() => setWidgetModalOpen(true)}
        >
          <span>⚙️</span> Personnaliser les widgets
        </button>
      </div>

      {/* Widget config modal */}
      <Modal open={widgetModalOpen} onClose={() => setWidgetModalOpen(false)} title="Widgets">
        <div className="flex flex-col gap-2">
          {widgetConfig.map((w, idx) => {
            const def = WIDGET_DEFS.find((d) => d.id === w.id);
            if (!def) return null;
            return (
              <div key={w.id} className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "var(--surface2)" }}>
                <span className="text-lg">{def.icon}</span>
                <span className="flex-1 text-sm font-bold">{def.label}</span>
                <button
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                  style={{ background: "var(--surface-solid)", color: idx === 0 ? "var(--faint)" : "var(--dim)" }}
                  onClick={() => moveWidget(idx, -1)}
                  disabled={idx === 0}
                >▲</button>
                <button
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                  style={{ background: "var(--surface-solid)", color: idx === widgetConfig.length - 1 ? "var(--faint)" : "var(--dim)" }}
                  onClick={() => moveWidget(idx, 1)}
                  disabled={idx === widgetConfig.length - 1}
                >▼</button>
                <button
                  className="w-9 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                  style={{
                    background: w.visible ? "rgba(124,107,240,0.15)" : "var(--surface-solid)",
                    color: w.visible ? "var(--accent)" : "var(--faint)",
                  }}
                  onClick={() => toggleWidgetVisibility(w.id)}
                >{w.visible ? "ON" : "OFF"}</button>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Quick Event Modal */}
      <Modal open={quickEventModal} onClose={() => setQuickEventModal(false)} title="Nouvel évènement">
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Titre</label>
            <input className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={qeTitle}
              onChange={(e) => {
                setQeTitle(e.target.value);
                if (qeCategory === "general") {
                  const detected = detectCategory(e.target.value);
                  if (detected !== "general") setQeCategory(detected);
                }
              }}
              placeholder="Ex: Foot, Dentiste, Ecole..." />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Heure</label>
            <input type="time" className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={qeTime} onChange={(e) => { setQeTime(e.target.value); setQeConflict(checkConflict(e.target.value, currentDate)); }} />
          </div>
          {members.length > 0 && (
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Membre</label>
              <select className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
                value={qeMember} onChange={(e) => setQeMember(e.target.value)}>
                <option value="">Aucun</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.emoji} {m.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Catégorie</label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_CATEGORIES.map((c) => (
                <button key={c.value} className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                  style={{
                    background: qeCategory === c.value ? `${c.color}20` : "var(--surface2)",
                    color: qeCategory === c.value ? c.color : "var(--dim)",
                    border: qeCategory === c.value ? `1px solid ${c.color}` : "1px solid transparent",
                  }}
                  onClick={() => setQeCategory(c.value)}>{c.emoji} {c.label}</button>
              ))}
            </div>
          </div>
          {/* Conflict warning */}
          {qeConflict && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: "rgba(240,124,74,0.12)", color: "var(--warm)", border: "1px solid rgba(240,124,74,0.2)" }}>
              <span>⚠️</span> {qeConflict}
            </div>
          )}
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Récurrence</label>
            <div className="flex gap-1.5">
              {([["none", "Aucune"], ["daily", "Quotidien"], ["weekly", "Hebdo"], ["monthly", "Mensuel"]] as const).map(([val, label]) => (
                <button key={val} className="flex-1 py-2 rounded-xl text-[11px] font-bold transition-all"
                  style={{
                    background: qeRecurrence === val ? "var(--accent-soft)" : "var(--surface2)",
                    color: qeRecurrence === val ? "var(--accent)" : "var(--dim)",
                    border: qeRecurrence === val ? "1px solid var(--accent)" : "1px solid transparent",
                  }}
                  onClick={() => setQeRecurrence(val)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Description (optionnel)</label>
            <input className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={qeDescription} onChange={(e) => setQeDescription(e.target.value)} placeholder="Détails..." />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Rappel</label>
            <select className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={qeReminder ?? ""} onChange={(e) => setQeReminder(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Aucun rappel</option>
              <option value="5">5 min avant</option>
              <option value="15">15 min avant</option>
              <option value="30">30 min avant</option>
              <option value="60">1 heure avant</option>
            </select>
          </div>
          {qeMember && (
            <label className="flex items-center gap-3 cursor-pointer py-1">
              <div className="relative w-11 h-6 rounded-full transition-colors"
                style={{ background: qeShared ? "var(--accent)" : "var(--surface2)", border: "1px solid var(--glass-border)" }}
                onClick={() => setQeShared(!qeShared)}>
                <div className="absolute top-0.5 w-5 h-5 rounded-full transition-all" style={{ background: "#fff", left: qeShared ? 20 : 2 }} />
              </div>
              <span className="text-sm" style={{ color: "var(--text)" }}>
                {qeShared ? "👨‍👩‍👧‍👦 Visible par la famille" : "🔒 Perso uniquement"}
              </span>
            </label>
          )}
          <button className="w-full py-3 rounded-xl font-bold text-sm"
            style={{ background: "var(--accent)", color: "#fff" }} onClick={saveQuickEvent}>Ajouter</button>
        </div>
      </Modal>

      {/* Meal Modal */}
      <Modal open={mealModal} onClose={() => setMealModal(false)} title={editingMeal ? "Modifier le repas" : "Ajouter un repas"}>
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Type de repas</label>
            <div className="flex gap-2">
              {MEAL_TYPES.map((t) => (
                <button key={t.value} className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
                  style={{
                    background: mealType === t.value ? "var(--accent-soft)" : "var(--surface2)",
                    color: mealType === t.value ? "var(--accent)" : "var(--dim)",
                    border: mealType === t.value ? "1px solid var(--accent)" : "1px solid transparent",
                  }}
                  onClick={() => { setMealType(t.value); setMealEmoji(t.emoji); }}>{t.emoji} {t.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Plat</label>
            <input className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="Ex: Poulet roti, Pates bolognaise..." />
          </div>
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Emoji</label>
            <div className="flex gap-2">
              {["🍳", "🥗", "🍝", "🍕", "🍔", "🥐", "🍲", "🥩"].map((e) => (
                <button key={e} className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                  style={{ background: mealEmoji === e ? "var(--accent-soft)" : "var(--surface2)", border: mealEmoji === e ? "1px solid var(--accent)" : "1px solid transparent" }}
                  onClick={() => setMealEmoji(e)}>{e}</button>
              ))}
            </div>
          </div>
          <button className="w-full py-3 rounded-xl font-bold text-sm"
            style={{ background: "var(--accent)", color: "#fff" }} onClick={saveMeal}>{editingMeal ? "Modifier" : "Ajouter"}</button>
        </div>
      </Modal>

      {/* Quick Voice */}
      <QuickVoice context={flowContext} onAction={handleFlowAction} />

      {/* FAB */}
      <button
        className="fixed flex items-center justify-center rounded-full text-white text-xl"
        style={{
          bottom: "calc(90px + env(safe-area-inset-bottom, 0px))",
          right: "max(20px, calc(50% - 195px))",
          width: 58,
          height: 58,
          background: "linear-gradient(135deg, var(--accent), var(--teal))",
          boxShadow: "0 6px 28px var(--accent-glow), 0 0 16px rgba(94,212,200,0.2)",
          zIndex: 50,
          border: "2px solid rgba(255,255,255,0.15)",
        }}
        onClick={() => setChatOpen(true)}
      >
        <Logo size={28} />
      </button>

      {/* Notifications */}
      <NotificationManager events={events} birthdays={birthdays} enabled={true} />

      {/* Chat */}
      <FlowChat open={chatOpen} onClose={() => setChatOpen(false)} context={flowContext} onAction={handleFlowAction} />

      {/* Family Chat */}
    </div>
  );
}
