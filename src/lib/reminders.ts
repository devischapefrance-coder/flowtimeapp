"use client";

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
  const today = now.toISOString().split("T")[0];
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
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
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
