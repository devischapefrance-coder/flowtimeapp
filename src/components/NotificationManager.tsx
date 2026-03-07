"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Event, Birthday } from "@/lib/types";

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const BDAY_STORAGE_KEY = "flowtime_bday_notified";

interface NotificationManagerProps {
  events: Event[];
  birthdays?: Birthday[];
  enabled: boolean;
}

function getBdayNotifiedToday(): Set<string> {
  try {
    const raw = localStorage.getItem(BDAY_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    const today = localDateStr(new Date());
    if (parsed.date !== today) return new Set();
    return new Set(parsed.keys || []);
  } catch {
    return new Set();
  }
}

function setBdayNotified(key: string) {
  const today = localDateStr(new Date());
  const current = getBdayNotifiedToday();
  current.add(key);
  localStorage.setItem(BDAY_STORAGE_KEY, JSON.stringify({ date: today, keys: Array.from(current) }));
}

export default function NotificationManager({ events, birthdays, enabled }: NotificationManagerProps) {
  const notifiedRef = useRef<Set<string>>(new Set());

  const checkBirthdays = useCallback(() => {
    if (!birthdays?.length || Notification.permission !== "granted") return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const notified = getBdayNotifiedToday();

    for (const bday of birthdays) {
      const [, month, day] = bday.date.split("-").map(Number);
      const next = new Date(today.getFullYear(), month - 1, day);
      if (next < today) next.setFullYear(next.getFullYear() + 1);
      const diff = Math.round((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diff === 0 && !notified.has(`${bday.id}-0`)) {
        setBdayNotified(`${bday.id}-0`);
        new Notification("FlowTime 🎂", {
          body: `Bon anniversaire ${bday.name} !`,
          icon: "/icons/icon.svg",
          tag: `bday-${bday.id}-0`,
        });
      } else if (diff === 1 && !notified.has(`${bday.id}-1`)) {
        setBdayNotified(`${bday.id}-1`);
        new Notification("FlowTime 🎂", {
          body: `Anniversaire de ${bday.name} demain !`,
          icon: "/icons/icon.svg",
          tag: `bday-${bday.id}-1`,
        });
      } else if (diff === 7 && !notified.has(`${bday.id}-7`)) {
        setBdayNotified(`${bday.id}-7`);
        new Notification("FlowTime 🎂", {
          body: `Anniversaire de ${bday.name} dans 7 jours !`,
          icon: "/icons/icon.svg",
          tag: `bday-${bday.id}-7`,
        });
      }
    }
  }, [birthdays]);

  useEffect(() => {
    if (!enabled || !("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    const interval = setInterval(() => {
      if (Notification.permission !== "granted") return;

      const now = new Date();
      const today = localDateStr(now);

      for (const ev of events) {
        if (ev.date !== today) continue;

        const [h, m] = ev.time.split(":").map(Number);
        const eventTime = new Date();
        eventTime.setHours(h, m, 0, 0);

        const diffMin = (eventTime.getTime() - now.getTime()) / (1000 * 60);
        const key15 = `${ev.id}-15`;
        const key5 = `${ev.id}-5`;

        const roundedMin = Math.round(diffMin);

        // 10 minutes before (window: 9-11 min)
        if (diffMin > 9 && diffMin <= 11 && !notifiedRef.current.has(key15)) {
          notifiedRef.current.add(key15);
          const memberName = ev.members?.name ? ` (${ev.members.name})` : "";
          new Notification("FlowTime ⏰", {
            body: `Dans ${roundedMin} min : ${ev.title}${memberName} a ${ev.time}`,
            icon: "/icons/icon.svg",
            tag: key15,
          });
        }

        // 5 minutes before (window: 4-6 min)
        if (diffMin > 4 && diffMin <= 6 && !notifiedRef.current.has(key5)) {
          notifiedRef.current.add(key5);
          const memberName = ev.members?.name ? ` (${ev.members.name})` : "";
          new Notification("FlowTime 🔔", {
            body: `Dans ${roundedMin} min : ${ev.title}${memberName}`,
            icon: "/icons/icon.svg",
            tag: key5,
          });
        }
      }
    }, 30000);

    // Check birthdays on mount and every 30 min
    checkBirthdays();
    const bdayInterval = setInterval(checkBirthdays, 30 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearInterval(bdayInterval);
    };
  }, [events, enabled, checkBirthdays]);

  return null;
}
