"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import FlowChat from "@/components/FlowChat";
import Timeline from "@/components/Timeline";
import DayAgenda from "@/components/DayAgenda";
import QuickVoice from "@/components/QuickVoice";
import NotificationManager from "@/components/NotificationManager";
import type { Event, Member, Address, Contact, Meal, Birthday, Expense } from "@/lib/types";
import Modal from "@/components/Modal";
import Logo from "@/components/Logo";
import { useRealtimeEvents } from "@/lib/realtime";
import { checkReminders, checkEventReminders } from "@/lib/reminders";
import { downloadICS, shareICS } from "@/lib/ical";
import { exportPDF } from "@/lib/pdf-export";
import { EVENT_CATEGORIES, getCategoryColor, detectCategory } from "@/lib/categories";
import { cacheData, getCachedData } from "@/lib/offline";
import { getWeatherWithGeolocation } from "@/lib/weather";

// ---- Widget config types ----
interface WidgetConfig {
  id: string;
  visible: boolean;
}

const WIDGET_DEFS: { id: string; label: string; icon: string }[] = [
  { id: "stats", label: "Stats rapides", icon: "📊" },
  { id: "next_event", label: "Prochain event", icon: "⏭️" },
  { id: "flow", label: "Flow AI", icon: "🤖" },
  { id: "weather", label: "Meteo", icon: "🌤️" },
  { id: "calendar", label: "Planning", icon: "📅" },
  { id: "meals", label: "Repas", icon: "🍽️" },
  { id: "expenses", label: "Depenses", icon: "💰" },
  { id: "birthdays", label: "Anniversaires", icon: "🎂" },
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

// ---- Calendar helpers ----
function getWeekDays(offset: number) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday + offset * 7);

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const todayStr = today.toISOString().split("T")[0];
    const isToday = dateStr === todayStr;
    days.push({
      date: dateStr,
      isToday,
      label: isToday ? "Aujourd'hui" : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }),
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
  const todayStr = new Date().toISOString().split("T")[0];

  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d.toISOString().split("T")[0], dayNum: d.getDate(), isCurrentMonth: false, isToday: d.toISOString().split("T")[0] === todayStr });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i);
    const dateStr = d.toISOString().split("T")[0];
    days.push({ date: dateStr, dayNum: i, isCurrentMonth: true, isToday: dateStr === todayStr });
  }
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - startDow - lastDay.getDate() + 1);
    days.push({ date: d.toISOString().split("T")[0], dayNum: d.getDate(), isCurrentMonth: false, isToday: d.toISOString().split("T")[0] === todayStr });
  }
  return days;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon apres-midi";
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
  const { profile } = useProfile();
  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"famille" | "perso">("famille");
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [isOffline, setIsOffline] = useState(false);

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
  const [viewType, setViewType] = useState<"timeline" | "agenda">("timeline");

  // Widget state
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [editMode, setEditMode] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartY = useRef(0);
  const dragCurrentY = useRef(0);

  // Weather state
  const [weather, setWeather] = useState<WeatherData | null>(null);

  const days = getWeekDays(weekOffset);
  const [selectedDay, setSelectedDay] = useState(() => {
    const idx = getWeekDays(0).findIndex((d) => d.isToday);
    return idx >= 0 ? idx : 0;
  });
  const currentDate = days[selectedDay].date;
  const dateDisplay = days[selectedDay].dayName;

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

    const weekDays = getWeekDays(weekOffset);
    const startDate = weekDays[0].date;
    const endDate = weekDays[6].date;

    // Month boundaries for expenses
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    const [evRes, memRes, addrRes, contRes, mealRes, bdayRes, expRes] = await Promise.all([
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.family_id, weekOffset]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load month events when in month view
  useEffect(() => {
    if (calendarView !== "month" || !profile?.family_id) return;
    const firstDay = new Date(monthYear, monthMonth, 1);
    const lastDay = new Date(monthYear, monthMonth + 1, 0);
    const startDate = firstDay.toISOString().split("T")[0];
    const endDate = lastDay.toISOString().split("T")[0];
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

  const todayStr = new Date().toISOString().split("T")[0];
  const todayEvents = viewEvents.filter((e) => e.date === todayStr);

  const now = new Date();
  const nextEvent = dayEvents
    .filter((e) => {
      if (!e.time) return false;
      const [h, m] = e.time.split(":").map(Number);
      return h * 60 + m > now.getHours() * 60 + now.getMinutes();
    })
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""))[0];

  async function deleteEvent(id: string) {
    await supabase.from("events").delete().eq("id", id);
    loadData();
  }

  async function deleteEventSeries(ev: Event) {
    if (!profile?.family_id || !ev.recurring) return;
    if (!confirm("Supprimer toute la serie ?")) return;
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
            date: d.toISOString().split("T")[0],
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
    setQuickEventModal(true);
  }

  async function saveQuickEvent() {
    if (!profile?.family_id || !qeTitle.trim() || !qeTime) return;
    const category = qeCategory === "general" ? detectCategory(qeTitle) : qeCategory;
    await supabase.from("events").insert({
      family_id: profile.family_id,
      title: qeTitle.trim(),
      time: qeTime,
      date: currentDate,
      member_id: qeMember || null,
      description: qeDescription.trim(),
      category,
      shared: qeShared,
      reminder_minutes: qeReminder,
    });
    setQuickEventModal(false);
    loadData();
  }

  // --- Meal CRUD ---
  const MEAL_TYPES = [
    { value: "petit-dejeuner", label: "Petit-dej", emoji: "🍳" },
    { value: "dejeuner", label: "Dejeuner", emoji: "🥗" },
    { value: "diner", label: "Diner", emoji: "🍝" },
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
    const d = new Date(dateStr);
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + diffToMonday);
    const targetDow = d.getDay();
    const targetMonday = new Date(d);
    const diff = targetDow === 0 ? -6 : 1 - targetDow;
    targetMonday.setDate(d.getDate() + diff);
    const weekDiff = Math.round((targetMonday.getTime() - thisMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
    setWeekOffset(weekDiff);
    const dayIdx = targetDow === 0 ? 6 : targetDow - 1;
    setSelectedDay(dayIdx);
    setCalendarView("week");
  }

  // ---- Widget drag & drop ----
  function handleLongPressStart() {
    longPressTimer.current = setTimeout(() => {
      setEditMode(true);
    }, 500);
  }

  function handleLongPressEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleDragStart(idx: number, clientY: number) {
    if (!editMode) return;
    setDragIdx(idx);
    dragStartY.current = clientY;
    dragCurrentY.current = clientY;
  }

  function handleDragMove(clientY: number) {
    if (dragIdx === null) return;
    dragCurrentY.current = clientY;
    const diff = clientY - dragStartY.current;
    const itemHeight = 70; // approximate widget height
    const steps = Math.round(diff / itemHeight);
    if (steps !== 0) {
      const newConfig = [...widgetConfig];
      const newIdx = Math.max(0, Math.min(newConfig.length - 1, dragIdx + steps));
      if (newIdx !== dragIdx) {
        const [item] = newConfig.splice(dragIdx, 1);
        newConfig.splice(newIdx, 0, item);
        setWidgetConfig(newConfig);
        saveWidgetConfig(newConfig);
        setDragIdx(newIdx);
        dragStartY.current = clientY;
      }
    }
  }

  function handleDragEnd() {
    setDragIdx(null);
  }

  function toggleWidgetVisibility(id: string) {
    const newConfig = widgetConfig.map((w) =>
      w.id === id ? { ...w, visible: !w.visible } : w
    );
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
    selectedDayName: days[selectedDay].dayName,
    today: todayStr,
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
        onClick={() => !editMode && setChatOpen(true)}
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
            <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Meteo</p>
            <p className="text-xs" style={{ color: "var(--faint)" }}>Chargement...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="card !mb-0 flex items-center gap-3">
        <span className="text-3xl">{weather.icon}</span>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Meteo</p>
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
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)" }}
              onClick={() => {
                if (calendarView === "week") { setWeekOffset((o) => o - 1); setSelectedDay(0); }
                else prevMonth();
              }}
            >‹</button>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold capitalize" style={{ color: "var(--dim)" }}>{weekMonthLabel}</span>
              {calendarView === "week" && weekOffset !== 0 && (
                <button
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                  onClick={() => { setWeekOffset(0); const idx = getWeekDays(0).findIndex((d) => d.isToday); setSelectedDay(idx >= 0 ? idx : 0); }}
                >Aujourd&apos;hui</button>
              )}
              <button
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                style={{ background: "var(--surface2)", color: "var(--dim)" }}
                onClick={() => {
                  if (calendarView === "week") {
                    const d = new Date(days[selectedDay].date);
                    setMonthYear(d.getFullYear());
                    setMonthMonth(d.getMonth());
                    setCalendarView("month");
                  } else setCalendarView("week");
                }}
                title={calendarView === "week" ? "Vue mois" : "Vue semaine"}
              >{calendarView === "week" ? "📅" : "📋"}</button>
            </div>
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)" }}
              onClick={() => {
                if (calendarView === "week") { setWeekOffset((o) => o + 1); setSelectedDay(0); }
                else nextMonth();
              }}
            >›</button>
          </div>

          {/* Week view */}
          {calendarView === "week" && (
            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => {
                const date = new Date(d.date);
                const dayNum = date.getDate();
                const dayLetter = date.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 3);
                const isSelected = selectedDay === i;
                const count = eventCounts[d.date] || 0;
                const dotColor = dayCategoryColors[d.date] || "var(--accent)";
                return (
                  <button key={d.date} className="flex flex-col items-center py-2 rounded-2xl transition-all"
                    style={{ background: isSelected ? "var(--accent)" : "transparent", boxShadow: isSelected ? "0 4px 16px var(--accent-glow)" : "none" }}
                    onClick={() => setSelectedDay(i)}
                  >
                    <span className="text-[10px] font-bold uppercase" style={{ color: isSelected ? "#fff" : "var(--faint)" }}>{dayLetter}</span>
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
            <p className="label !mb-0">{days[selectedDay].isToday ? "Planning du jour" : `Planning — ${days[selectedDay].label}`}</p>
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
              onClick={() => { const weekDays = getWeekDays(weekOffset); exportPDF(viewEvents, weekDays[0].date, weekDays[6].date); }}
              title="Exporter PDF">📄</button>
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-lg mb-2"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={openQuickEvent} title="Ajouter un evenement">+</button>
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
            <p className="text-sm" style={{ color: "var(--dim)" }}>Aucun evenement {days[selectedDay].isToday ? "aujourd'hui" : "ce jour"}</p>
            <button className="text-xs font-bold mt-2" style={{ color: "var(--accent)" }} onClick={openQuickEvent}>+ Ajouter un evenement</button>
          </div>
        )}
      </>
    );
  }

  function renderMeals() {
    return (
      <div>
        <p className="label">🍽️ Repas {days[selectedDay].isToday ? "du jour" : `— ${days[selectedDay].label}`}</p>
        <div className="flex flex-col gap-2">
          {MEAL_TYPES.map((type) => {
            const meal = dayMeals.find((m) => m.meal_type === type.value);
            return (
              <div key={type.value} className="card !mb-0 flex items-center gap-3 cursor-pointer"
                onClick={() => !editMode && (meal ? openEditMeal(meal) : openNewMeal(type.value))}>
                <span className="text-xl">{meal ? meal.emoji : type.emoji}</span>
                <div className="flex-1">
                  <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>{type.label}</p>
                  {meal ? <p className="text-sm font-bold">{meal.name}</p> : <p className="text-xs" style={{ color: "var(--faint)" }}>Pas encore defini</p>}
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
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Depenses du mois</p>
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

  return (
    <div
      className="px-4 py-4 animate-in gradient-bg"
      style={{ paddingBottom: 100 }}
      onPointerMove={(e) => handleDragMove(e.clientY)}
      onPointerUp={handleDragEnd}
    >
      {/* Offline banner */}
      {isOffline && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-bold text-center" style={{ background: "rgba(240,124,74,0.15)", color: "var(--warm)", border: "1px solid rgba(240,124,74,0.2)" }}>
          📡 Hors ligne — donnees en cache
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{getGreeting()}, {profile?.first_name}</h1>
          <p className="text-sm capitalize mt-0.5" style={{ color: "var(--dim)" }}>{dateDisplay}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-sm"
            style={{ background: "var(--surface2)" }} onClick={handleExport} title="Exporter le calendrier">📤</button>
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl overflow-hidden"
            style={{ background: "var(--surface2)" }}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="Profil" className="w-full h-full object-cover" /> : profile?.emoji || "👤"}
          </div>
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

      {/* Edit mode banner */}
      {editMode && (
        <div className="flex items-center justify-between mt-3 px-3 py-2 rounded-xl" style={{ background: "var(--accent-soft)", border: "1px solid rgba(124,107,240,0.2)" }}>
          <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>Mode edition — Reorganisez vos widgets</span>
          <button
            className="text-xs font-bold px-3 py-1 rounded-lg"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={() => setEditMode(false)}
          >
            OK
          </button>
        </div>
      )}

      {/* Widgets */}
      <div className="flex flex-col gap-3 mt-3">
        {widgetConfig.map((w, idx) => {
          if (!w.visible && !editMode) return null;
          const def = WIDGET_DEFS.find((d) => d.id === w.id);
          const content = renderWidget(w.id);
          if (!content && !editMode) return null;

          return (
            <div
              key={w.id}
              className={`relative ${editMode ? "widget-wiggle" : ""} ${dragIdx === idx ? "widget-dragging" : ""} ${!w.visible && editMode ? "opacity-40" : ""}`}
              style={{ transition: dragIdx === idx ? "none" : "transform 0.2s" }}
              onTouchStart={(e) => {
                handleLongPressStart();
                if (editMode) handleDragStart(idx, e.touches[0].clientY);
              }}
              onTouchMove={(e) => {
                handleLongPressEnd();
                if (editMode) handleDragMove(e.touches[0].clientY);
              }}
              onTouchEnd={() => {
                handleLongPressEnd();
                handleDragEnd();
              }}
              onPointerDown={(e) => {
                if (editMode) handleDragStart(idx, e.clientY);
              }}
            >
              {/* Edit mode overlay controls */}
              {editMode && (
                <div className="absolute -top-1 -right-1 z-10 flex items-center gap-1">
                  <button
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                    style={{ background: "var(--surface-solid)", border: "1px solid var(--glass-border)" }}
                    onClick={(e) => { e.stopPropagation(); toggleWidgetVisibility(w.id); }}
                    title={w.visible ? "Masquer" : "Afficher"}
                  >
                    {w.visible ? "👁️" : "👁️‍🗨️"}
                  </button>
                </div>
              )}
              {editMode && (
                <div className="absolute top-1/2 -left-1 -translate-y-1/2 z-10">
                  <span className="text-xs cursor-grab" style={{ color: "var(--dim)" }}>⠿</span>
                </div>
              )}

              {/* Widget label in edit mode */}
              {editMode && !content && (
                <div className="card !mb-0 flex items-center gap-2 py-3">
                  <span>{def?.icon}</span>
                  <span className="text-xs font-bold" style={{ color: "var(--dim)" }}>{def?.label}</span>
                  <span className="text-[10px] ml-auto" style={{ color: "var(--faint)" }}>Masque</span>
                </div>
              )}

              {/* Actual widget content */}
              {(w.visible || editMode) && content}
            </div>
          );
        })}
      </div>

      {/* Quick Event Modal */}
      <Modal open={quickEventModal} onClose={() => setQuickEventModal(false)} title="Nouvel evenement">
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
              value={qeTime} onChange={(e) => setQeTime(e.target.value)} />
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
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Categorie</label>
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
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>Description (optionnel)</label>
            <input className="w-full px-3 py-2.5 rounded-xl text-sm"
              style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
              value={qeDescription} onChange={(e) => setQeDescription(e.target.value)} placeholder="Details..." />
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
          bottom: 100,
          right: "max(20px, calc(50% - 195px))",
          width: 54,
          height: 54,
          background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
          boxShadow: "0 4px 24px var(--accent-glow)",
          zIndex: 50,
        }}
        onClick={() => setChatOpen(true)}
      >
        <Logo size={24} />
      </button>

      {/* Notifications */}
      <NotificationManager events={events} birthdays={birthdays} enabled={true} />

      {/* Chat */}
      <FlowChat open={chatOpen} onClose={() => setChatOpen(false)} context={flowContext} onAction={handleFlowAction} />
    </div>
  );
}
