import type { Event } from "./types";

function escapeIcal(s: string): string {
  return s.replace(/[\\;,\n]/g, (c) => {
    if (c === "\n") return "\\n";
    return "\\" + c;
  });
}

function formatDate(date: string, time?: string): string {
  const d = date.replace(/-/g, "");
  if (time) {
    const t = time.replace(/:/g, "").padEnd(4, "0") + "00";
    return `${d}T${t}`;
  }
  return d;
}

export function generateICS(events: Event[], calendarName = "FlowTime"): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//FlowTime//FR",
    `X-WR-CALNAME:${calendarName}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const ev of events) {
    const uid = `${ev.id}@flowtime.app`;
    const dtStart = formatDate(ev.date, ev.time);
    // Default 1h duration if time is set, otherwise all-day
    let dtEnd: string;
    if (ev.time) {
      const [h, m] = ev.time.split(":").map(Number);
      const endH = h + 1;
      dtEnd = formatDate(ev.date, `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    } else {
      const next = new Date(ev.date);
      next.setDate(next.getDate() + 1);
      dtEnd = formatDate(next.toISOString().split("T")[0]);
    }

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    if (ev.time) {
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    }
    lines.push(`SUMMARY:${escapeIcal(ev.title)}`);
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeIcal(ev.description)}`);
    }
    if (ev.members?.name) {
      lines.push(`ATTENDEE:${escapeIcal(ev.members.name)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadICS(events: Event[], filename = "flowtime-calendar.ics") {
  const ics = generateICS(events);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function shareICS(events: Event[]) {
  const ics = generateICS(events);
  const file = new File([ics], "flowtime-calendar.ics", { type: "text/calendar" });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: "FlowTime Calendar",
      files: [file],
    });
  } else {
    downloadICS(events);
  }
}
