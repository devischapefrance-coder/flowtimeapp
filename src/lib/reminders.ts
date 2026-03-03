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

  const todayEvents = events.filter((e) => e.date === today);

  // Morning reminder: 7-9am
  if (h >= 7 && h < 9 && state.morning !== today) {
    setState({ ...state, morning: today });
    if (todayEvents.length === 0) {
      return {
        title: `Bonjour ${userName} !`,
        body: "Aucun evenement prevu aujourd'hui. Profite de ta journee !",
      };
    }
    const first = todayEvents
      .filter((e) => e.time)
      .sort((a, b) => a.time.localeCompare(b.time))[0];
    return {
      title: `Bonjour ${userName} !`,
      body: `${todayEvents.length} evenement(s) aujourd'hui${first ? `. Prochain : ${first.title} a ${first.time}` : ""}`,
    };
  }

  // Evening reminder: 8-10pm
  if (h >= 20 && h < 22 && state.evening !== today) {
    setState({ ...state, evening: today });
    // Tomorrow's events
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    const tomorrowEvents = events.filter((e) => e.date === tomorrowStr);

    if (tomorrowEvents.length === 0) {
      return {
        title: `Bonne soiree ${userName} !`,
        body: "Rien de prevu demain. Repose-toi bien !",
      };
    }
    return {
      title: `Bonne soiree ${userName} !`,
      body: `${tomorrowEvents.length} evenement(s) demain. Prepare-toi !`,
    };
  }

  return null;
}
