import type { Event } from "./types";
import { getCategoryColor } from "./categories";

export function exportPDF(events: Event[], startDate: string, endDate: string) {
  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

  // Build 7 days
  const days: { date: string; label: string; events: Event[] }[] = [];
  const start = new Date(startDate);
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const dayNum = d.getDate();
    const dayName = dayNames[d.getDay()];
    days.push({
      date: dateStr,
      label: `${dayName} ${dayNum}`,
      events: events.filter((e) => e.date === dateStr).sort((a, b) => a.time.localeCompare(b.time)),
    });
  }

  const startLabel = new Date(startDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const endLabel = new Date(endDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Planning ${startLabel} - ${endLabel}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 20px; color: #1a1a2e; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
  .day { border: 1px solid #e0e0e0; border-radius: 8px; padding: 8px; min-height: 150px; }
  .day-header { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #666; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
  .event { margin-bottom: 6px; padding: 4px 6px; border-radius: 6px; font-size: 10px; border-left: 3px solid; }
  .event-time { font-weight: 700; }
  .event-title { font-weight: 600; }
  .event-member { color: #888; font-size: 9px; }
  .empty { color: #ccc; font-size: 10px; font-style: italic; }
  @media print {
    body { padding: 10px; }
    .day { break-inside: avoid; }
  }
</style>
</head>
<body>
<h1>Planning familial</h1>
<p class="subtitle">Semaine du ${startLabel} au ${endLabel}</p>
<div class="grid">
${days.map((day) => `
  <div class="day">
    <div class="day-header">${day.label}</div>
    ${day.events.length === 0 ? '<p class="empty">—</p>' : day.events.map((ev) => {
      const color = getCategoryColor(ev.category);
      return `<div class="event" style="background:${color}15;border-color:${color}">
        <span class="event-time">${ev.time}</span>
        <span class="event-title"> ${ev.title}</span>
        ${ev.members ? `<div class="event-member">${ev.members.emoji || ""} ${ev.members.name || ""}</div>` : ""}
      </div>`;
    }).join("")}
  </div>
`).join("")}
</div>
</body>
</html>`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 300);
  }
}
