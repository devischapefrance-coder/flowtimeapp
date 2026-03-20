"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import FlowChat from "@/components/FlowChat";
import Timeline from "@/components/Timeline";
import DayAgenda from "@/components/DayAgenda";
import QuickVoice from "@/components/QuickVoice";
import NotificationManager from "@/components/NotificationManager";
import type { Event, EventScope, Member, Address, Contact, Meal, Birthday, Chore, DeviceLocation } from "@/lib/types";
import dynamic from "next/dynamic";
import type { MapMarker } from "@/components/MapView";
import { useThemeMapStyle } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });
import { notifyFamily } from "@/lib/push";
import Modal from "@/components/Modal";
import Logo from "@/components/Logo";
import { useRealtimeEvents, useRealtimeChores, useRealtimeMeals, useRealtimeBirthdays, useRealtimeMembers } from "@/lib/realtime";

import { checkReminders, checkEventReminders } from "@/lib/reminders";
import { downloadICS, shareICS } from "@/lib/ical";
import { exportPDF } from "@/lib/pdf-export";
import { EVENT_CATEGORIES, getCategoryColor, detectCategory } from "@/lib/categories";
import { cacheData, getCachedData } from "@/lib/offline";
import { getWeatherWithGeolocation } from "@/lib/weather";
import { DEFAULT_MEMBER_COLOR } from "@/lib/constants";
import type { WeatherData } from "@/lib/weather";
import { useToast } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import { usePullToRefresh, PullIndicator } from "@/lib/usePullToRefresh";

// ---- Widget config types ----
interface WidgetConfig {
  id: string;
  visible: boolean;
}

const WIDGET_DEFS: { id: string; label: string; icon: string }[] = [
  { id: "stats", label: "Stats rapides", icon: "📊" },
  { id: "flow", label: "Flow AI", icon: "🤖" },
  { id: "calendar", label: "Planning", icon: "📅" },
  { id: "meals", label: "Repas", icon: "🍽️" },
  { id: "birthdays", label: "Anniversaires", icon: "🎂" },
  { id: "family_map", label: "Carte famille", icon: "🗺️" },
  { id: "chores", label: "Tâches", icon: "🧹" },
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

export default function HomePage() {
  const { profile, chatUnread, openChat, setAppTheme } = useProfile();
  const router = useRouter();

  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  function getAvatarUrl(userId: string): string {
    const { data } = supabase.storage.from("avatars").getPublicUrl(`${userId}/avatar.webp`);
    return data.publicUrl;
  }
  const [events, setEvents] = useState<Event[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [birthdays, setBirthdays] = useState<Birthday[]>([]);
  const [chores, setChores] = useState<Chore[]>([]);
  const [devices, setDevices] = useState<DeviceLocation[]>([]);
  const themeMapStyle = useThemeMapStyle();
  const [chatOpen, setChatOpen] = useState(false);

  const [dataLoaded, setDataLoaded] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => localDateStr(new Date()));
  const [viewMode, setViewMode] = useState<"famille" | "perso">("perso");
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [isOffline, setIsOffline] = useState(false);
  const scrollStripRef = useRef<HTMLDivElement>(null);
  const scrollInitRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

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

  // Month view state (single state to avoid desync on month navigation)
  const [monthView, setMonthView] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const monthYear = monthView.year;
  const monthMonth = monthView.month;
  const [monthEvents, setMonthEvents] = useState<Event[]>([]);

  // Meal state
  const [mealModal, setMealModal] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [mealName, setMealName] = useState("");
  const [mealType, setMealType] = useState<string>("dejeuner");
  const [mealEmoji, setMealEmoji] = useState("🍽️");

  function suggestMealEmoji(text: string): string | null {
    const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const map: [string[], string][] = [
      // Plats composés / spécifiques (priorité haute)
      [["naan fromage", "naan cheese", "cheese naan"], "🧀"],
      [["pain fromage", "croque monsieur", "croque madame", "welsh"], "🧀"],
      [["poulet curry", "tikka masala", "butter chicken"], "🍛"],
      [["poulet frite", "poulet frites"], "🍗"],
      [["poulet roti", "poulet grille", "poulet braise"], "🍗"],
      [["pate carbonara", "pate bolognaise", "pate pesto"], "🍝"],
      [["cordon bleu"], "🍗"],
      [["fish and chips", "fish & chips"], "🐟"],
      [["pain perdu"], "🍞"],
      [["pot au feu", "pot-au-feu", "blanquette"], "🍲"],
      [["hachis parmentier", "gratin dauphinois", "gratin"], "🥘"],
      // Plats principaux
      [["pizza", "calzone"], "🍕"],
      [["burger", "hamburger", "smash"], "🍔"],
      [["frite", "frites", "patate", "pomme de terre", "puree"], "🍟"],
      [["poulet", "chicken", "nugget", "aiguillette", "escalope"], "🍗"],
      [["steak", "boeuf", "viande", "entrecote", "bavette", "filet", "hache", "boulette"], "🥩"],
      [["porc", "cote de porc", "travers", "echine", "saucisse", "merguez", "chipolata"], "🥩"],
      [["agneau", "gigot", "souris d'agneau", "carre d'agneau"], "🥩"],
      [["poisson", "saumon", "thon", "cabillaud", "sardine", "truite", "sole", "bar", "daurade", "lieu"], "🐟"],
      [["crevette", "gambas", "fruit de mer", "moule", "huitre", "calamars", "poulpe", "langouste"], "🦐"],
      [["sushi", "maki", "sashimi", "japonais", "ramen", "udon", "gyoza", "tempura"], "🍣"],
      [["pate", "pasta", "spaghetti", "tagliatelle", "bolognaise", "carbonara", "lasagne", "penne", "fusilli", "gnocchi", "ravioli", "cannelloni"], "🍝"],
      [["riz", "risotto", "wok", "asiatique", "chinois", "thai", "cantonais", "pilaf", "biryani", "nasi"], "🍚"],
      [["soupe", "potage", "bouillon", "veloute", "minestrone", "gaspacho", "pho"], "🍲"],
      [["salade", "crudite", "bowl", "poke", "taboulé", "cesar"], "🥗"],
      [["sandwich", "panini", "wrap", "croque", "club", "bagel", "focaccia"], "🥪"],
      [["taco", "burrito", "mexicain", "fajita", "quesadilla", "enchilada", "nachos", "chili"], "🌮"],
      [["kebab", "grec", "shawarma", "doner", "pita", "falafel"], "🥙"],
      [["oeuf", "omelette", "oeuf brouille", "oeuf plat", "frittata"], "🥚"],
      [["crepe", "galette", "pancake", "gaufre", "blini"], "🥞"],
      [["croissant", "viennoiserie", "pain au chocolat", "brioche", "chausson"], "🥐"],
      [["pain", "tartine", "toast", "baguette", "bruschetta"], "🍞"],
      [["fromage", "raclette", "fondue", "tartiflette", "camembert", "mont d'or"], "🧀"],
      [["couscous", "tajine", "mechoui"], "🫕"],
      [["curry", "indien", "naan", "dhal", "samossa", "pakora", "vindaloo", "tandoori"], "🍛"],
      [["hot dog", "hotdog"], "🌭"],
      [["roti", "rotisserie", "grille", "bbq", "barbecue", "brochette", "plancha"], "🔥"],
      [["jambon", "charcuterie", "pate en croute", "terrine", "rillette"], "🥓"],
      // Petit-dej / goûter
      [["cereale", "muesli", "granola", "porridge", "avoine"], "🥣"],
      [["yaourt", "yogourt", "fromage blanc", "compote"], "🥛"],
      [["cafe", "chocolat chaud", "the", "lait"], "☕"],
      [["confiture", "miel", "nutella", "pate a tartiner"], "🍯"],
      // Desserts
      [["gateau", "dessert", "fondant", "mousse", "tiramisu", "tarte", "eclair", "chou", "mille-feuille", "profiterole", "brownie", "cookie", "muffin", "macaron"], "🍰"],
      [["glace", "sorbet", "sundae", "frozen"], "🍨"],
      [["fruit", "pomme", "banane", "fraise", "mangue", "ananas", "melon", "pasteque", "kiwi", "orange"], "🍎"],
      [["chocolat", "bonbon", "friandise"], "🍫"],
      // Légumes / végé
      [["legume", "haricot", "brocoli", "courgette", "carotte", "ratatouille", "epinard", "aubergine", "poivron", "tomate", "lentille", "pois chiche"], "🥦"],
      [["quiche", "tourte", "feuillete", "empanada"], "🥧"],
      [["risotto"], "🍚"],
    ];
    for (const [keywords, emoji] of map) {
      if (keywords.some((k) => t.includes(k))) return emoji;
    }
    return null;
  }

  // Quick event creation state
  const [quickEventModal, setQuickEventModal] = useState(false);
  const [qeTitle, setQeTitle] = useState("");
  const [qeTime, setQeTime] = useState("09:00");
  const [qeMember, setQeMember] = useState<string>("");
  const [qeCategory, setQeCategory] = useState("general");
  const [qeDescription, setQeDescription] = useState("");
  const [qeScope, setQeScope] = useState<EventScope | null>(null);
  const [qeReminder, setQeReminder] = useState<number | null>(null);

  const [qeRecurrence, setQeRecurrence] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [qeConflict, setQeConflict] = useState<string | null>(null);
  const [viewType, setViewType] = useState<"timeline" | "agenda">("timeline");
  const { toast, toastUndo } = useToast();
  const { pullDistance, refreshing } = usePullToRefresh(() => loadData());

  // Widget state
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig[]>(DEFAULT_WIDGETS);
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);

  // Weather state
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Widget expanded modal states
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [birthdaysOpen, setBirthdaysOpen] = useState(false);

  // On mount: check goto-date override from search
  useEffect(() => {
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

  // Load event counts for the entire day strip (carousel dots)
  const [stripCounts, setStripCounts] = useState<Record<string, number>>({});
  const [stripColors, setStripColors] = useState<Record<string, string>>({});
  const refreshStripCounts = useCallback(() => {
    if (!profile?.family_id) return;
    const strip = getDayStrip();
    const stripStart = strip[0].date;
    const stripEnd = strip[strip.length - 1].date;
    supabase
      .from("events")
      .select("date, category, member_id, scope")
      .eq("family_id", profile.family_id)
      .gte("date", stripStart)
      .lte("date", stripEnd)
      .then(({ data }) => {
        if (!data) return;
        // Filtrer par scope/viewMode comme pour viewEvents
        const myMemberId = members.find((m) => m.user_id === profile?.id)?.id
          || members.find((m) => m.name.toLowerCase() === (profile?.first_name || "").toLowerCase())?.id
          || null;
        const filtered = viewMode === "perso" && myMemberId
          ? data.filter((ev) => (ev.scope === "perso" && ev.member_id === myMemberId) || ev.scope === "famille")
          : data.filter((ev) => ev.scope === "famille");
        const counts: Record<string, number> = {};
        const cats: Record<string, Record<string, number>> = {};
        for (const ev of filtered) {
          counts[ev.date] = (counts[ev.date] || 0) + 1;
          if (!cats[ev.date]) cats[ev.date] = {};
          const cat = ev.category || "general";
          cats[ev.date][cat] = (cats[ev.date][cat] || 0) + 1;
        }
        setStripCounts(counts);
        const colors: Record<string, string> = {};
        for (const [date, catMap] of Object.entries(cats)) {
          const dominant = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
          colors[date] = dominant ? getCategoryColor(dominant[0]) : getCategoryColor("general");
        }
        setStripColors(colors);
      });
  }, [profile?.family_id, profile?.id, profile?.first_name, viewMode, members]);
  useEffect(() => { refreshStripCounts(); }, [refreshStripCounts]);

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

    const [evRes, memRes, addrRes, contRes, mealRes, bdayRes, choreRes, devRes] = await Promise.all([
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
      supabase.from("chores").select("*").eq("family_id", profile.family_id),
      supabase.from("device_locations").select("*").eq("family_id", profile.family_id),
    ]);
    const memberIds = new Set((memRes.data || []).map((m: Member) => m.id));
    if (evRes.data) {
      const validEvents = (evRes.data as Event[]).filter((e) => !e.member_id || memberIds.has(e.member_id));
      setEvents(validEvents);
      cacheData("events", validEvents as unknown as Array<{ id: string } & Record<string, unknown>>);
    }
    if (memRes.data) {
      setMembers(memRes.data as Member[]);
      cacheData("members", memRes.data as Array<{ id: string } & Record<string, unknown>>);
    }
    if (addrRes.data) setAddresses(addrRes.data as Address[]);
    if (contRes.data) setContacts(contRes.data as Contact[]);
    if (mealRes.data) setMeals(mealRes.data as Meal[]);
    if (bdayRes.data) {
      const validBdays = (bdayRes.data as Birthday[]).filter((b) => b.member_id && memberIds.has(b.member_id));
      setBirthdays(validBdays);
    }
    if (choreRes.data) setChores(choreRes.data as Chore[]);
    if (devRes.data) setDevices(devRes.data as DeviceLocation[]);
    // Clean up orphaned birthdays (member was deleted, member_id set to NULL)
    supabase.from("birthdays").delete().is("member_id", null).eq("family_id", profile.family_id);
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
        if (data) {
          const memberSet = new Set(members.map((m) => m.id));
          setMonthEvents((data as Event[]).filter((e) => !e.member_id || memberSet.has(e.member_id)));
        }
      });
  }, [calendarView, monthYear, monthMonth, profile?.family_id]);

  useRealtimeEvents(profile?.family_id, loadData);
  useRealtimeChores(profile?.family_id, loadData);
  useRealtimeMeals(profile?.family_id, loadData);
  useRealtimeBirthdays(profile?.family_id, loadData);
  useRealtimeMembers(profile?.family_id, loadData);

  // Polling fallback: refresh every 10s
  useEffect(() => {
    if (!profile?.family_id) return;
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [profile?.family_id, loadData]);

  // Scroll day strip to selected date
  useEffect(() => {
    if (!selectedDate) return;

    isAutoScrollingRef.current = true;

    function scrollToDate(instant: boolean) {
      if (!scrollStripRef.current) return;
      const el = scrollStripRef.current.querySelector(`[data-date="${selectedDate}"]`) as HTMLElement | null;
      if (!el) return;
      const container = scrollStripRef.current;
      const scrollLeft = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
      if (instant) {
        container.scrollLeft = scrollLeft;
      } else {
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    }

    if (!scrollInitRef.current) {
      // First load: try multiple times to ensure layout is ready
      scrollToDate(true);
      const t1 = setTimeout(() => scrollToDate(true), 50);
      const t2 = setTimeout(() => { scrollToDate(true); scrollInitRef.current = true; isAutoScrollingRef.current = false; }, 300);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else {
      scrollToDate(false);
      const t = setTimeout(() => { isAutoScrollingRef.current = false; }, 400);
      return () => clearTimeout(t);
    }
  }, [selectedDate]);

  // Auto-select centered date when user scrolls the day strip
  useEffect(() => {
    const el = scrollStripRef.current;
    if (!el) return;

    let timeout: ReturnType<typeof setTimeout>;

    function handleScrollEnd() {
      if (isAutoScrollingRef.current) return;
      if (!scrollStripRef.current) return;
      const container = scrollStripRef.current;
      const centerX = container.scrollLeft + container.clientWidth / 2;
      const buttons = container.querySelectorAll<HTMLElement>("[data-date]");
      let closestDate = "";
      let closestDist = Infinity;
      for (const btn of buttons) {
        const btnCenter = btn.offsetLeft + btn.clientWidth / 2;
        const dist = Math.abs(btnCenter - centerX);
        if (dist < closestDist) { closestDist = dist; closestDate = btn.dataset.date || ""; }
      }
      if (closestDate && closestDate !== selectedDateRef.current) {
        setSelectedDate(closestDate);
      }
    }

    function handleScroll() {
      clearTimeout(timeout);
      timeout = setTimeout(handleScrollEnd, 250);
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => { el.removeEventListener("scroll", handleScroll); clearTimeout(timeout); };
  }, [calendarView]);

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

  const myMember = members.find((m) => m.user_id === profile?.id)
    || members.find((m) => m.name.toLowerCase() === (profile?.first_name || "").toLowerCase());

  // Filtrage par scope :
  // - "Mon planning" : events perso du user + events famille (tous membres)
  // - "Famille" : uniquement les events scope=famille
  const viewEvents = viewMode === "perso" && myMember
    ? events.filter((e) => (e.scope === "perso" && e.member_id === myMember.id) || e.scope === "famille")
    : viewMode === "perso" && !myMember
      ? events.filter((e) => e.scope === "famille")
      : events.filter((e) => e.scope === "famille");

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
    ? monthEvents.filter((e) => (e.scope === "perso" && e.member_id === myMember.id) || e.scope === "famille")
    : viewMode === "perso" && !myMember
      ? monthEvents.filter((e) => e.scope === "famille")
      : monthEvents.filter((e) => e.scope === "famille");
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
    refreshStripCounts();
    if (ev) {
      toastUndo(`"${ev.title}" supprimé`, async () => {
        const { id: _id, members: _m, ...rest } = ev as unknown as Record<string, unknown>;
        void _id; void _m;
        await supabase.from("events").insert(rest);
        loadData();
        refreshStripCounts();
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
    refreshStripCounts();
  }

  function resolveMemberId(memberName?: string): string | null {
    if (!memberName) return null;
    const mem = members.find((m) => m.name.toLowerCase() === memberName.toLowerCase());
    return mem?.id || null;
  }

  function resolveFlowMemberId(memberName?: string): string | null {
    const resolved = resolveMemberId(memberName);
    if (resolved) return resolved;
    // Always fallback to the current user's member, regardless of view mode
    if (myMember) return myMember.id;
    return null;
  }

  async function handleFlowAction(action: { type: string; data: Record<string, unknown> }) {
    if (!profile?.family_id) return;

    // Changement de thème — géré côté client uniquement
    if (action.type === "change_theme") {
      const theme = (action.data.theme as "default" | "stone-amber") || "default";
      const mode = (action.data.mode as "dark" | "light") || "dark";
      setAppTheme(theme, mode);
      return;
    }

    await executeFlowAction(action);

    // Notification famille si scope=famille
    const scope = (action.data.scope as string) || (viewMode === "famille" ? "famille" : "perso");
    if (scope === "famille" && (action.type === "add_event" || action.type === "add_recurring")) {
      const title = String(action.data.title || "");
      const name = profile?.first_name || "Quelqu'un";
      notifyFamily("FlowTime 📅", `${name} a ajouté : ${title}`);
    }
  }

  async function executeFlowAction(action: { type: string; data: Record<string, unknown> }) {
    if (!profile?.family_id) return;

    // Déterminer le scope : priorité à action.data.scope, sinon déduit du viewMode
    const scope = (action.data.scope as EventScope) || (viewMode === "famille" ? "famille" : "perso");

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
        scope,
      });
    } else if (action.type === "delete_event") {
      const { error } = await supabase.from("events").delete().eq("id", action.data.event_id);
      if (error) console.error("Flow delete_event failed:", error, "event_id:", action.data.event_id);
    } else if (action.type === "edit_event") {
      const title = (action.data.title as string) || "";
      const { error: delErr } = await supabase.from("events").delete().eq("id", action.data.event_id);
      if (delErr) console.error("Flow edit_event delete failed:", delErr, "event_id:", action.data.event_id);
      await supabase.from("events").insert({
        family_id: profile.family_id,
        title,
        time: action.data.time,
        date: action.data.date || currentDate,
        member_id: resolveFlowMemberId(action.data.member_name as string),
        description: action.data.description || "",
        category: (action.data.category as string) || detectCategory(title),
        scope,
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
            scope,
          });
        }
      }
    } else if (action.type === "add_task") {
      const assignedMember = resolveMemberId(action.data.assigned_to as string) || myMember?.id || null;
      await supabase.from("chores").insert({
        family_id: profile.family_id,
        name: action.data.title as string,
        emoji: "✅",
        frequency: "daily",
        assigned_members: assignedMember ? [assignedMember] : [],
        current_index: 0,
      });
    } else if (action.type === "complete_task") {
      // Rotation de la tâche (passer au membre suivant)
      const { error } = await supabase.from("chores").update({ last_rotated: new Date().toISOString() }).eq("id", action.data.task_id);
      if (error) console.error("Flow complete_task failed:", error, "task_id:", action.data.task_id);
    } else if (action.type === "add_meal") {
      await supabase.from("meals").insert({
        family_id: profile.family_id,
        name: action.data.name as string,
        type: action.data.type as string,
        date: (action.data.date as string) || currentDate,
        emoji: (action.data.emoji as string) || "🍽️",
      });
    } else if (action.type === "create_note") {
      await supabase.from("notes").insert({
        family_id: profile.family_id,
        user_id: profile.id,
        title: action.data.title as string,
        content: (action.data.content as string) || "",
      });
    } else if (action.type === "change_theme") {
      // Géré côté client via onChangeTheme callback
      return;
    }
    loadData();
    refreshStripCounts();
  }

  // --- Quick event creation ---
  function openQuickEvent() {
    setQeTitle("");
    setQeTime("09:00");
    setQeMember(viewMode === "perso" && myMember ? myMember.id : "");
    setQeCategory("general");
    setQeDescription("");
    setQeScope(null);
    setQeReminder(null);
    setQeRecurrence("none");
    setQeConflict(null);
    setQuickEventModal(true);
  }

  async function saveQuickEvent() {
    if (!profile?.family_id || !qeTitle.trim() || !qeTime || !qeScope) return;
    const category = qeCategory === "general" ? detectCategory(qeTitle) : qeCategory;
    const baseEvent = {
      family_id: profile.family_id,
      title: qeTitle.trim(),
      time: qeTime,
      member_id: qeMember || null,
      description: qeDescription.trim(),
      category,
      scope: qeScope,
      reminder_minutes: qeReminder,
    };

    if (qeRecurrence === "none") {
      await supabase.from("events").insert({ ...baseEvent, date: currentDate });
      notifyFamily("FlowTime 📅", `${profile.first_name || "Quelqu'un"} a ajouté : ${qeTitle.trim()} à ${qeTime}`);
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
      notifyFamily("FlowTime 📅", `${profile.first_name || "Quelqu'un"} a créé ${dates.length} évènements récurrents : ${qeTitle.trim()}`);
      toast(`${dates.length} évènements récurrents créés`, "success");
    }
    setQuickEventModal(false);
    loadData();
    refreshStripCounts();
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
      notifyFamily("FlowTime 🍽️", `${profile.first_name || "Quelqu'un"} a prévu : ${mealEmoji} ${mealName.trim()}`);
    }
    setMealModal(false);
    loadData();
  }

  async function deleteMeal(id: string) {
    await supabase.from("meals").delete().eq("id", id);
    loadData();
  }

  // Month navigation (atomic update)
  function prevMonth() {
    setMonthView((prev) => prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 });
  }
  function nextMonth() {
    setMonthView((prev) => prev.month === 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: prev.month + 1 });
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

  // Birthdays: all sorted by upcoming, widget shows 3
  const allBirthdaysSorted = (() => {
    const today = new Date();
    const thisYear = today.getFullYear();
    return birthdays
      .map((b) => {
        const [birthYear, m, d] = b.date.split("-").map(Number);
        let nextBday = new Date(thisYear, m - 1, d);
        if (nextBday < today) nextBday = new Date(thisYear + 1, m - 1, d);
        const daysUntil = Math.ceil((nextBday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const age = nextBday.getFullYear() - birthYear;
        return { ...b, daysUntil, nextBday, age: birthYear > 1900 ? age : null };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  })();
  const upcomingBirthdays = allBirthdaysSorted.slice(0, 3);

  const monthDays = calendarView === "month" ? getMonthDays(monthYear, monthMonth) : [];

  const flowMe = members.find((m) => m.user_id === profile?.id);
  const flowContext = {
    userName: profile?.first_name,
    userRole: flowMe?.role || "",
    userEmoji: flowMe?.emoji || profile?.emoji || "",
    userBirthDate: profile?.birth_date || flowMe?.birth_date || "",
    userMemberName: flowMe?.name || profile?.first_name || "",
    members: members.map((m) => ({ name: m.name, role: m.role, emoji: m.emoji, birth_date: m.birth_date })),
    birthdays: birthdays.map((b) => ({ name: b.name, date: b.date, emoji: b.emoji })),
    todayEvents: dayEvents.map((e) => ({ id: e.id, title: e.title, time: e.time, date: e.date, member: e.members?.name, category: e.category })),
    weekEvents: viewEvents.map((e) => ({ id: e.id, title: e.title, time: e.time, date: e.date, member: e.members?.name, category: e.category })),
    addresses: addresses.map((a) => ({ name: a.name, address: a.address })),
    contacts: contacts.map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
    chores: chores.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, assigned_to: members.find((m) => c.assigned_members.includes(m.id))?.name })),
    selectedDate: currentDate,
    selectedDayName: dateDisplay,
    today: todayStr,
    currentTime: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    viewMode,
    weather: weather ? { temperature: weather.temperature, description: weather.description, icon: weather.icon } : null,
  };

  // ---- Widget render functions ----
  function renderWidget(widgetId: string) {
    switch (widgetId) {
      case "stats": return renderStats();
      case "flow": return renderFlow();
      case "calendar": return renderCalendar();
      case "meals": return renderMeals();
      case "birthdays": return renderBirthdays();

      case "family_map": return renderFamilyMap();
      case "chores": return renderChores();
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

  // ---- Proactive Flow message (AI-generated) ----
  const [proactiveMsg, setProactiveMsg] = useState<{ main: string; sub?: string } | null>(null);
  const [proactiveLoading, setProactiveLoading] = useState(true);
  const proactiveFetched = useRef(false);

  useEffect(() => {
    if (!profile?.id || proactiveFetched.current) return;
    proactiveFetched.current = true;

    const cacheKey = `flowtime_proactive_${profile.id}`;

    // Try cache first
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached.main) {
          setProactiveMsg(cached);
          setProactiveLoading(false);
        }
      }
    } catch { /* ignore */ }

    // Fetch fresh message
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/flow/proactive", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ context: flowContext }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.main) {
            setProactiveMsg(data);
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
          }
        }
      } catch { /* keep cache if exists */ }
      setProactiveLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  function WeatherSvgIcon({ description }: { description: string }) {
    const d = description.toLowerCase();
    const props = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

    if (d.includes("orage") || d.includes("tonnerre")) {
      return <svg {...props}><path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973" /><path d="m13 12-3 5h4l-3 5" /></svg>;
    }
    if (d.includes("neige")) {
      return <svg {...props}><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01" /></svg>;
    }
    if (d.includes("pluie") || d.includes("averse") || d.includes("bruine")) {
      return <svg {...props}><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M16 14v6M8 14v6M12 16v6" /></svg>;
    }
    if (d.includes("brouillard") || d.includes("brume")) {
      return <svg {...props}><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M16 17H7M17 21H9" /></svg>;
    }
    if (d.includes("nuage") || d.includes("couvert")) {
      return <svg {...props}><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg>;
    }
    // Soleil par défaut
    return <svg {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>;
  }

  function renderFlow() {
    return (
      <button
        onClick={() => setChatOpen(true)}
        className="w-full text-left cursor-pointer rounded-3xl p-4"
        data-tutorial="flow-chat-widget"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--glass-border)",
        }}
        aria-label="Ouvrir Flow IA"
      >
        {/* Ligne principale : orbe + textes */}
        <div className="flex items-start gap-3">
          {/* Orbe animée */}
          <div
            className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center"
            style={{
              background: "var(--surface2)",
              animation: "flow-ia-float 3s ease-in-out infinite",
            }}
          >
            <div
              className="w-3 h-3 rounded-full"
              style={{
                background: "var(--accent)",
                animation: "flow-ia-pulse 3s ease-in-out infinite",
              }}
            />
          </div>

          {/* Textes */}
          <div className="flex-1 min-w-0">
            <p
              className="text-[10px] font-bold uppercase"
              style={{
                color: "var(--accent)",
                letterSpacing: "0.07em",
              }}
            >
              FLOW IA
            </p>
            {proactiveLoading && !proactiveMsg ? (
              <div className="space-y-1.5 mt-1.5">
                <div
                  className="h-3 w-3/4 rounded-full animate-pulse"
                  style={{ background: "var(--accent-soft)" }}
                />
                <div
                  className="h-2.5 w-1/2 rounded-full animate-pulse"
                  style={{ background: "var(--accent-soft)" }}
                />
              </div>
            ) : proactiveMsg ? (
              <>
                <p
                  className="text-[12.5px] mt-1"
                  style={{ color: "var(--text)", lineHeight: "1.45" }}
                >
                  {proactiveMsg.main}
                </p>
                {proactiveMsg.sub && (
                  <p
                    className="text-[11px] mt-0.5 truncate"
                    style={{ color: "var(--dim)" }}
                  >
                    {proactiveMsg.sub}
                  </p>
                )}
              </>
            ) : (
              <p
                className="text-[12.5px] mt-1"
                style={{ color: "var(--dim)", lineHeight: "1.45" }}
              >
                Demande-moi n&apos;importe quoi !
              </p>
            )}
          </div>
        </div>

        {/* Météo */}
        {weather && (
          <div
            className="mt-3 pt-3 flex items-center gap-1.5"
            style={{ borderTop: "0.5px solid var(--glass-border)", color: "var(--dim)" }}
          >
            <WeatherSvgIcon description={weather.description} />
            <span className="text-[11px]">
              {weather.description}
            </span>
            <span className="text-[11px]">
              · {weather.temperature}°C
            </span>
          </div>
        )}
      </button>
    );
  }

  // renderWeather supprimé — météo intégrée dans renderFlow

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
                    setMonthView({ year: d.getFullYear(), month: d.getMonth() });
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
              data-tutorial="day-carousel"
              className="flex gap-1 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory" }}
            >
              {dayStrip.map((d) => {
                const date = new Date(d.date);
                const dayNum = date.getDate();
                const dayLetter = date.toLocaleDateString("fr-FR", { weekday: "short" }).slice(0, 1).toUpperCase();
                const isSelected = d.date === selectedDate;
                const count = stripCounts[d.date] || 0;
                const dotColor = stripColors[d.date] || "var(--accent)";
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
          <div className="flex justify-center gap-3 mb-3 overflow-x-auto px-1 py-1 -mx-1 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
            <button className="flex flex-col items-center gap-1 shrink-0" style={{ opacity: !filter ? 1 : 0.4 }} onClick={() => setFilter(null)}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                style={{ background: !filter ? "var(--accent-soft)" : "var(--surface2)", outline: !filter ? "2px solid var(--accent)" : "none", outlineOffset: 2 }}>👥</div>
              <span className="text-[9px] font-bold" style={{ color: !filter ? "var(--accent)" : "var(--dim)" }}>Tous</span>
            </button>
            {members.map((m) => {
              const active = filter === m.id;
              return (
                <button key={m.id} className="flex flex-col items-center gap-1 shrink-0" style={{ opacity: active ? 1 : 0.4 }} onClick={() => setFilter(active ? null : m.id)}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg overflow-hidden"
                    style={{ background: "var(--surface2)", outline: active ? `2px solid ${m.color}` : "none", outlineOffset: 2 }}>
                    {m.user_id && !failedAvatars.has(m.user_id) ? (
                      <img src={getAvatarUrl(m.user_id)} alt="" className="w-full h-full object-cover" onError={() => setFailedAvatars((prev) => new Set(prev).add(m.user_id!))} />
                    ) : m.emoji}
                  </div>
                  <span className="text-[9px] font-bold truncate max-w-[48px]" style={{ color: active ? m.color : "var(--dim)" }}>{m.name.split(" ")[0]}</span>
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
              data-tutorial="add-event-btn"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={openQuickEvent} title="Ajouter un évènement">+</button>
          </div>
        </div>

        {viewType === "timeline" ? (
          <Timeline events={filteredEvents} allEvents={dayEvents} selectedDate={currentDate} viewMode={viewMode} onDelete={deleteEvent} onDeleteSeries={deleteEventSeries}
            onReorder={async (eventId, newTime) => { await supabase.from("events").update({ time: newTime }).eq("id", eventId); loadData(); }}
            onEditTitle={async (eventId, newTitle) => { await supabase.from("events").update({ title: newTitle }).eq("id", eventId); loadData(); }}
            onEditDescription={async (eventId, newDesc) => { await supabase.from("events").update({ description: newDesc }).eq("id", eventId); loadData(); }}
            getAvatarUrl={(userId) => failedAvatars.has(userId) ? null : getAvatarUrl(userId)} />
        ) : (
          <DayAgenda events={filteredEvents} selectedDate={currentDate} onDelete={deleteEvent}
            onReorder={async (eventId, newTime) => { await supabase.from("events").update({ time: newTime }).eq("id", eventId); loadData(); }}
            getAvatarUrl={(userId) => failedAvatars.has(userId) ? null : getAvatarUrl(userId)} />
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
                  <button className="text-xs p-1 rounded-full" style={{ color: "var(--red)" }}
                    onClick={(e) => { e.stopPropagation(); deleteMeal(meal.id); }}>🗑️</button>
                ) : <span className="text-lg" style={{ color: "var(--accent)" }}>+</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderBirthdays() {
    return (
      <div className="card !mb-0 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => setBirthdaysOpen(true)}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Prochains anniversaires</p>
          <span className="text-sm" style={{ color: "var(--faint)" }}>›</span>
        </div>
        {upcomingBirthdays.length > 0 ? (
          <div className="flex flex-col gap-2">
            {upcomingBirthdays.map((b) => {
              const bMember = b.member_id ? members.find((m) => m.id === b.member_id) : null;
              const bUserId = bMember?.user_id;
              return (
              <div key={b.id} className="flex items-center gap-3">
                {bUserId && !failedAvatars.has(bUserId) ? (
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                    <img src={getAvatarUrl(bUserId)} alt="" className="w-full h-full object-cover" onError={() => setFailedAvatars((prev) => new Set(prev).add(bUserId))} />
                  </div>
                ) : (
                  <span className="text-xl">{b.emoji || "🎂"}</span>
                )}
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
                  background: b.daysUntil <= 7 ? "color-mix(in srgb, var(--red) 15%, transparent)" : "var(--surface2)",
                  color: b.daysUntil <= 7 ? "var(--red)" : "var(--dim)",
                }}>{b.nextBday.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
              </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--faint)" }}>Aucun anniversaire enregistre</p>
        )}
      </div>
    );
  }


  function renderFamilyMap() {
    const addressMarkers: MapMarker[] = addresses.filter((a) => a.lat && a.lng).map((a) => ({
      id: a.id, lat: a.lat!, lng: a.lng!, emoji: a.emoji || "📍", name: a.name, type: "address" as const,
    }));
    const uniqueDevs = Object.values(
      devices.reduce<Record<string, typeof devices[0]>>((acc, d) => {
        if (!acc[d.user_id] || new Date(d.updated_at) > new Date(acc[d.user_id].updated_at)) acc[d.user_id] = d;
        return acc;
      }, {})
    );
    const deviceMarkers: MapMarker[] = uniqueDevs.map((d) => {
      const member = members.find((m) => m.user_id === d.user_id);
      return {
        id: d.id, lat: d.lat, lng: d.lng,
        emoji: member?.emoji || d.emoji || "📱", name: member?.name || d.device_name,
        color: DEFAULT_MEMBER_COLOR, type: "device" as const,
        avatarUrl: d.user_id ? getAvatarUrl(d.user_id) : undefined,
      };
    });
    const allMarkers = [...addressMarkers, ...deviceMarkers];
    const center: [number, number] = devices.length > 0
      ? [devices[0].lat, devices[0].lng]
      : profile?.lat && profile?.lng
        ? [profile.lat, profile.lng]
        : allMarkers.length > 0 ? [allMarkers[0].lat, allMarkers[0].lng] : [46.6, 2.5];
    return (
      <Link href="/flowmap" className="card !mb-0 block cursor-pointer">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Carte famille</p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--surface2)", color: "var(--dim)" }}>
            Voir →
          </span>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ height: 180, pointerEvents: "none" }}>
          <MapView
            markers={allMarkers}
            center={center}
            zoom={allMarkers.length > 0 ? 12 : 6}
            height="180px"
            mapStyle={themeMapStyle}
            interactive={false}
          />
        </div>
      </Link>
    );
  }

  async function toggleChore(choreId: string, isDone: boolean) {
    await supabase.from("chores").update({
      last_rotated: isDone ? null : localDateStr(new Date()),
    }).eq("id", choreId);
    loadData();
  }

  function renderChores() {
    const displayChores = chores;
    const doneCount = displayChores.filter((ch) => ch.last_rotated === todayStr).length;
    const totalCount = displayChores.length;
    return (
      <div className="card !mb-0">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--dim)" }}>Tâches du jour</p>
          {totalCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: doneCount === totalCount ? "color-mix(in srgb, var(--green) 15%, transparent)" : "var(--surface2)", color: doneCount === totalCount ? "var(--green)" : "var(--dim)" }}>
              {doneCount}/{totalCount} faites
            </span>
          )}
        </div>
        {totalCount > 0 ? (
          <div className="flex flex-col gap-1.5">
            {displayChores.map((ch) => {
              const isDone = ch.last_rotated === todayStr;
              const assignedMember = ch.assigned_members.length > 0
                ? members.find((m) => m.id === ch.assigned_members[0])
                : null;
              return (
                <button
                  key={ch.id}
                  className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl transition-all active:scale-[0.98]"
                  style={{ background: "var(--surface2)", opacity: isDone ? 0.5 : 1 }}
                  onClick={() => toggleChore(ch.id, isDone)}
                >
                  <span
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[11px] shrink-0 transition-all"
                    style={{
                      borderColor: isDone ? "var(--green)" : "var(--border)",
                      background: isDone ? "var(--green)" : "transparent",
                      color: isDone ? "#fff" : "transparent",
                    }}
                  >
                    {isDone && "✓"}
                  </span>
                  <span className="text-base">{ch.emoji || "🧹"}</span>
                  <span className={`text-xs font-medium flex-1 ${isDone ? "line-through" : ""}`}>{ch.name}</span>
                  {assignedMember && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                      {assignedMember.emoji} {assignedMember.name}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState icon="🧹" title="Aucune tâche configurée" subtitle="Ajoute des tâches dans Vie de famille" />
        )}
        {totalCount > 0 && (
          <Link href={{ pathname: "/vie", query: { tab: "taches" } }} className="block text-center text-[10px] font-bold mt-3 transition-colors" style={{ color: "var(--faint)" }}>
            Gérer →
          </Link>
        )}
      </div>
    );
  }


  return (
    <div
      className="px-4 py-4 animate-in gradient-bg"
      style={{ paddingBottom: 180 }}
    >
      <PullIndicator pullDistance={pullDistance} refreshing={refreshing} />
      {/* Offline banner */}
      {isOffline && (
        <div className="mb-3 px-3 py-2 rounded-xl text-xs font-bold text-center" style={{ background: "color-mix(in srgb, var(--warm) 15%, transparent)", color: "var(--warm)", border: "1px solid color-mix(in srgb, var(--warm) 20%, transparent)" }}>
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
          style={{ background: viewMode === "perso" ? "var(--accent)" : "transparent", color: viewMode === "perso" ? "#fff" : "var(--dim)" }}
          onClick={() => { setViewMode("perso"); setFilter(null); }}>👤 Mon planning</button>
        <button className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: viewMode === "famille" ? "var(--accent)" : "transparent", color: viewMode === "famille" ? "#fff" : "var(--dim)" }}
          onClick={() => { setViewMode("famille"); setFilter(null); }}>👨‍👩‍👧‍👦 Famille</button>
      </div>

      {/* Widgets */}
      <div className="flex flex-col gap-3 mt-3 stagger-in">
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
                    background: w.visible ? "var(--accent-glow)" : "var(--surface-solid)",
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
              style={{ background: "color-mix(in srgb, var(--warm) 12%, transparent)", color: "var(--warm)", border: "1px solid color-mix(in srgb, var(--warm) 20%, transparent)" }}>
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
          <div>
            <label className="text-xs font-bold block mb-2" style={{ color: "var(--dim)" }}>Visibilité *</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl transition-all"
                style={{
                  background: qeScope === "perso" ? "var(--accent-glow)" : "transparent",
                  border: qeScope === "perso" ? "1.5px solid var(--accent)" : "1.5px solid var(--glass-border)",
                }}
                onClick={() => setQeScope("perso")}
              >
                <span className="text-lg">🔒</span>
                <span className="text-xs font-bold" style={{ color: qeScope === "perso" ? "var(--accent)" : "var(--text)" }}>Personnel</span>
                <span className="text-[10px] text-center leading-tight" style={{ color: "var(--dim)" }}>Visible uniquement dans Mon planning</span>
              </button>
              <button
                type="button"
                className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl transition-all"
                style={{
                  background: qeScope === "famille" ? "var(--accent-glow)" : "transparent",
                  border: qeScope === "famille" ? "1.5px solid var(--accent)" : "1.5px solid var(--glass-border)",
                }}
                onClick={() => setQeScope("famille")}
              >
                <span className="text-lg">👨‍👩‍👧‍👦</span>
                <span className="text-xs font-bold" style={{ color: qeScope === "famille" ? "var(--accent)" : "var(--text)" }}>Familial</span>
                <span className="text-[10px] text-center leading-tight" style={{ color: "var(--dim)" }}>Visible par toute la famille</span>
              </button>
            </div>
          </div>
          <button className="w-full py-3 rounded-xl font-bold text-sm transition-all"
            style={{
              background: qeScope ? "var(--accent)" : "var(--surface2)",
              color: qeScope ? "#fff" : "var(--dim)",
              cursor: qeScope ? "pointer" : "not-allowed",
            }}
            disabled={!qeScope}
            onClick={saveQuickEvent}>Ajouter</button>
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
              value={mealName} onChange={(e) => { setMealName(e.target.value); const s = suggestMealEmoji(e.target.value); if (s) setMealEmoji(s); }} placeholder="Ex: Poulet roti, Pates bolognaise..." />
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
      <QuickVoice context={flowContext} userId={profile?.id} onAction={handleFlowAction} onActionsDone={() => refreshStripCounts()} />

      {/* FAB */}
      <button
        className="fixed flex items-center justify-center rounded-full text-white text-xl"
        style={{
          bottom: "calc(90px + env(safe-area-inset-bottom, 0px))",
          right: "max(20px, calc(50% - 195px))",
          width: 58,
          height: 58,
          background: "linear-gradient(135deg, var(--accent), var(--teal))",
          boxShadow: "0 6px 28px var(--accent-glow), 0 0 16px color-mix(in srgb, var(--teal) 20%, transparent)",
          zIndex: 50,
          border: "2px solid var(--faint)",
        }}
        onClick={() => setChatOpen(true)}
      >
        <Logo size={28} />
      </button>

      {/* Notifications */}
      <NotificationManager events={events} birthdays={birthdays} enabled={true} />

      {/* Chat */}
      <FlowChat open={chatOpen} onClose={() => setChatOpen(false)} context={flowContext} userId={profile?.id} onAction={handleFlowAction} onActionsDone={() => refreshStripCounts()} />



      {/* Family Chat */}

      {/* Widget detail modals (portal-level to avoid stacking context issues) */}
      {weather && (() => {
        const DAY_NAMES_SHORT = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
        return (
          <Modal open={weatherOpen} onClose={() => setWeatherOpen(false)} title="Météo — 7 jours">
            <div className="flex items-center gap-4 mb-4 p-3 rounded-2xl" style={{ background: "var(--surface2)" }}>
              <span className="text-4xl">{weather.icon}</span>
              <div className="flex-1">
                <p className="text-2xl font-bold">{weather.temperature}°C</p>
                <p className="text-xs" style={{ color: "var(--dim)" }}>{weather.description}</p>
              </div>
              <div className="flex flex-col gap-1 text-right">
                {weather.windSpeed != null && <p className="text-xs" style={{ color: "var(--dim)" }}>💨 {weather.windSpeed} km/h</p>}
                {weather.humidity != null && <p className="text-xs" style={{ color: "var(--dim)" }}>💧 {weather.humidity}%</p>}
              </div>
            </div>
            {weather.daily?.[0] && (
              <div className="flex justify-center gap-6 mb-4">
                <span className="text-xs" style={{ color: "var(--dim)" }}>🌅 {weather.daily[0].sunrise.split("T")[1]}</span>
                <span className="text-xs" style={{ color: "var(--dim)" }}>🌇 {weather.daily[0].sunset.split("T")[1]}</span>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {weather.daily?.map((d, i) => {
                const date = new Date(d.date + "T00:00:00");
                const dayLabel = i === 0 ? "Aujourd'hui" : DAY_NAMES_SHORT[date.getDay()] + " " + date.getDate();
                return (
                  <div key={d.date} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--surface2)" }}>
                    <span className="text-lg w-7 text-center">{d.icon}</span>
                    <span className="text-xs font-bold flex-1 capitalize">{dayLabel}</span>
                    <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>{d.max}°</span>
                    <span className="text-xs" style={{ color: "var(--faint)" }}>{d.min}°</span>
                    {d.precip > 0 && <span className="text-[10px]" style={{ color: "var(--teal)" }}>💧{d.precip.toFixed(1)}</span>}
                    <span className="text-[10px] w-12 text-right" style={{ color: "var(--dim)" }}>💨 {d.wind}</span>
                  </div>
                );
              })}
            </div>
          </Modal>
        );
      })()}


      {(() => {
        const birthdaysByMonth: Record<number, typeof allBirthdaysSorted> = {};
        for (const b of allBirthdaysSorted) {
          const month = b.nextBday.getMonth();
          if (!birthdaysByMonth[month]) birthdaysByMonth[month] = [];
          birthdaysByMonth[month].push(b);
        }
        const MONTH_NAMES = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        return (
          <Modal open={birthdaysOpen} onClose={() => setBirthdaysOpen(false)} title="Tous les anniversaires">
            {allBirthdaysSorted.length > 0 ? (
              <div className="flex flex-col gap-4">
                {Object.entries(birthdaysByMonth)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([monthIdx, bdays]) => (
                    <div key={monthIdx}>
                      <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--accent)" }}>{MONTH_NAMES[Number(monthIdx)]}</p>
                      <div className="flex flex-col gap-2">
                        {bdays.map((b) => {
                          const bMem = b.member_id ? members.find((m) => m.id === b.member_id) : null;
                          const bUid = bMem?.user_id;
                          return (
                          <div key={b.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "var(--surface2)" }}>
                            {bUid && !failedAvatars.has(bUid) ? (
                              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                                <img src={getAvatarUrl(bUid)} alt="" className="w-full h-full object-cover" onError={() => setFailedAvatars((prev) => new Set(prev).add(bUid))} />
                              </div>
                            ) : (
                              <span className="text-xl">{b.emoji || "🎂"}</span>
                            )}
                            <div className="flex-1">
                              <p className="text-sm font-bold">{b.name}</p>
                              <p className="text-[10px]" style={{ color: "var(--dim)" }}>
                                {b.nextBday.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                                {b.age != null && ` · ${b.age} ans`}
                              </p>
                            </div>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
                              background: b.daysUntil <= 7 ? "color-mix(in srgb, var(--red) 15%, transparent)" : "var(--surface2)",
                              color: b.daysUntil <= 7 ? "var(--red)" : "var(--dim)",
                            }}>
                              {b.daysUntil === 0 ? "Aujourd'hui !" : b.daysUntil === 1 ? "Demain" : `J-${b.daysUntil}`}
                            </span>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-xs text-center py-4" style={{ color: "var(--faint)" }}>Aucun anniversaire enregistré</p>
            )}
          </Modal>
        );
      })()}


    </div>
  );
}
