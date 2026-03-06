"use client";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STORAGE_KEY = "flowtime_reminder_last";

interface ReminderState {
  morning: string; // ISO date
  evening: string; // ISO date
}

function getState(): ReminderState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { morning: "", evening: "" };
}

function setState(s: ReminderState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function checkReminders(
  events: { title: string; time: string; date: string }[],
  userName: string
): { title: string; body: string } | null {
  const now = new Date();
  const h = now.getHours();
  const today = localDateStr(now);
  const state = getState();

  const todayEvents = events
    .filter((e) => e.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));

  // Morning reminder: 7-9am — enhanced with event count + first event
  if (h >= 7 && h < 9 && state.morning !== today) {
    setState({ ...state, morning: today });
    if (todayEvents.length === 0) {
      return {
        title: `Bonjour ${userName} !`,
        body: "Aucun evenement prevu aujourd'hui. Profite de ta journee !",
      };
    }
    const first = todayEvents[0];
    const eventList = todayEvents
      .slice(0, 3)
      .map((e) => `${e.title} a ${e.time}`)
      .join(", ");
    const more = todayEvents.length > 3 ? ` +${todayEvents.length - 3} autre(s)` : "";
    return {
      title: `Bonjour ${userName} ! ${todayEvents.length} evenement(s)`,
      body: `Prochain : ${first.title} a ${first.time}. Aujourd'hui : ${eventList}${more}`,
    };
  }

  // Evening reminder: 8-10pm — detailed tomorrow summary
  if (h >= 20 && h < 22 && state.evening !== today) {
    setState({ ...state, evening: today });
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = localDateStr(tomorrow);
    const tomorrowEvents = events
      .filter((e) => e.date === tomorrowStr)
      .sort((a, b) => a.time.localeCompare(b.time));

    if (tomorrowEvents.length === 0) {
      return {
        title: `Bonne soiree ${userName} !`,
        body: "Rien de prevu demain. Repose-toi bien !",
      };
    }
    const eventList = tomorrowEvents
      .slice(0, 4)
      .map((e) => `${e.title} ${e.time}`)
      .join(", ");
    const more = tomorrowEvents.length > 4 ? "..." : "";
    return {
      title: `Bonne soiree ${userName} !`,
      body: `Demain : ${tomorrowEvents.length} evenement(s) — ${eventList}${more}`,
    };
  }

  return null;
}

const EVENT_REMINDER_KEY = "flowtime_event_reminders_sent";

function getSentReminders(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(EVENT_REMINDER_KEY) || "{}");
  } catch { return {}; }
}

function markReminderSent(key: string) {
  const sent = getSentReminders();
  sent[key] = true;
  // Clean up old entries (keep only last 200)
  const keys = Object.keys(sent);
  if (keys.length > 200) {
    for (const k of keys.slice(0, keys.length - 200)) delete sent[k];
  }
  localStorage.setItem(EVENT_REMINDER_KEY, JSON.stringify(sent));
}

export function checkEventReminders(
  events: { id: string; title: string; time: string; date: string; reminder_minutes: number | null }[]
): { title: string; body: string } | null {
  const now = new Date();
  const today = localDateStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const sent = getSentReminders();

  for (const ev of events) {
    if (!ev.reminder_minutes || ev.date !== today || !ev.time) continue;
    const [h, m] = ev.time.split(":").map(Number);
    const eventMinutes = h * 60 + m;
    const reminderAt = eventMinutes - ev.reminder_minutes;
    const diff = nowMinutes - reminderAt;

    // Fire if we're within 2 minutes of the reminder time
    if (diff >= 0 && diff < 2) {
      const dedupKey = `${ev.id}_${today}`;
      if (sent[dedupKey]) continue;
      markReminderSent(dedupKey);
      return {
        title: `Rappel : ${ev.title}`,
        body: `Dans ${ev.reminder_minutes} min (${ev.time})`,
      };
    }
  }
  return null;
}
