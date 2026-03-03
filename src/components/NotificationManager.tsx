"use client";

import { useEffect, useRef } from "react";
import type { Event } from "@/lib/types";

interface NotificationManagerProps {
  events: Event[];
  enabled: boolean;
}

export default function NotificationManager({ events, enabled }: NotificationManagerProps) {
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    const interval = setInterval(() => {
      if (Notification.permission !== "granted") return;

      const now = new Date();
      const today = now.toISOString().split("T")[0];

      for (const ev of events) {
        if (ev.date !== today) continue;

        const [h, m] = ev.time.split(":").map(Number);
        const eventTime = new Date();
        eventTime.setHours(h, m, 0, 0);

        const diffMin = (eventTime.getTime() - now.getTime()) / (1000 * 60);
        const key15 = `${ev.id}-15`;
        const key5 = `${ev.id}-5`;

        // 15 minutes before
        if (diffMin > 14 && diffMin <= 15 && !notifiedRef.current.has(key15)) {
          notifiedRef.current.add(key15);
          const memberName = ev.members?.name ? ` (${ev.members.name})` : "";
          new Notification("FlowTime ⏰", {
            body: `Dans 15 min : ${ev.title}${memberName} à ${ev.time}`,
            icon: "/icons/icon.svg",
            tag: key15,
          });
        }

        // 5 minutes before
        if (diffMin > 4 && diffMin <= 5 && !notifiedRef.current.has(key5)) {
          notifiedRef.current.add(key5);
          const memberName = ev.members?.name ? ` (${ev.members.name})` : "";
          new Notification("FlowTime 🔔", {
            body: `Dans 5 min : ${ev.title}${memberName}`,
            icon: "/icons/icon.svg",
            tag: key5,
          });
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [events, enabled]);

  return null;
}
