import { getAuthUser } from "@/lib/server-auth";

const PROACTIVE_SYSTEM_PROMPT = `Tu es Flow 🌊, l'assistant familial de FlowTime. Génère UN message proactif court et personnalisé pour l'utilisateur.

Règles :
- Tutoie, utilise son prénom, sois chaleureux et naturel
- Analyse le contexte (events du jour, heure, anniversaires) et choisis LE plus pertinent
- Ne dis JAMAIS "c'est l'anniversaire de X" quand X est l'utilisateur — souhaite-lui directement
- Priorité : event imminent > event en cours > anniversaire > résumé journée > salutation
- 1-2 emojis max

Réponds UNIQUEMENT en JSON valide : { "main": "message (max 120 chars)", "sub": "sous-texte optionnel (max 80 chars)" }`;

function buildProactivePrompt(context: Record<string, unknown>): string {
  const members = context.members
    ? (context.members as Array<{ name: string; role: string; emoji: string }>)
        .map((m) => `${m.emoji} ${m.name} (${m.role})`)
        .join(", ")
    : "Aucun membre";

  const todayEvents = context.todayEvents
    ? (context.todayEvents as Array<{ title: string; time: string; member?: string }>)
        .map((e) => `${e.time} - ${e.title}${e.member ? ` (${e.member})` : ""}`)
        .join(", ")
    : "Rien de prévu";

  const userName = context.userName || "l'utilisateur";
  const userRole = context.userRole || "";
  const userEmoji = context.userEmoji || "";
  const userMemberName = context.userMemberName || userName;
  const userBirthDate = context.userBirthDate || "non renseignée";

  const birthdays = context.birthdays
    ? (context.birthdays as Array<{ name: string; date: string; emoji: string }>)
        .map((b) => `${b.emoji} ${b.name} (${b.date})`)
        .join(", ")
    : "Aucun";

  return `=== CONTEXTE ===
👤 Utilisateur : ${userEmoji} ${userName} (${userRole || "membre"})
   Nom dans les membres : ${userMemberName}
   Date de naissance : ${userBirthDate}
Date du jour : ${context.today}
Heure : ${context.currentTime || "non disponible"}
👨‍👩‍👧‍👦 Membres : ${members}
📅 Events du jour : ${todayEvents}
🎂 Anniversaires : ${birthdays}

Génère un message proactif pertinent.`;
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { context } = body;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 256,
          system: PROACTIVE_SYSTEM_PROMPT,
          messages: [
            { role: "user", content: buildProactivePrompt(context || {}) },
          ],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json();

      if (!response.ok) {
        console.error("Proactive API error:", response.status);
        return Response.json({ error: "API error" }, { status: 500 });
      }

      const text = data.content[0].text;

      try {
        const parsed = JSON.parse(text);
        return Response.json(parsed);
      } catch {
        return Response.json({ main: text.slice(0, 120) });
      }
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        return Response.json({ error: "Timeout" }, { status: 504 });
      }
      throw err;
    }
  } catch (err) {
    console.error("Proactive flow error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
