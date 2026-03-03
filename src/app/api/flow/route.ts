const SYSTEM_PROMPT = `Tu es Flow, un assistant familial intelligent et chaleureux.
Tu parles en français, tu es concis et utile.
Tu tutoies l'utilisateur.

Tu as accès au contexte familial : membres, événements du jour, adresses.

Tu peux effectuer ces actions :
1. Ajouter un événement → { "response": "...", "action": { "type": "add_event", "data": { "title": "...", "time": "HH:MM", "date": "YYYY-MM-DD", "member_name": "..." } } }
2. Supprimer un événement → { "action": { "type": "delete_event", "data": { "event_id": "..." } } }
3. Ajouter un emploi du temps récurrent → { "action": { "type": "add_recurring", "data": { "title": "...", "days": [1,3,5], "time_start": "HH:MM", "time_end": "HH:MM", "member_name": "..." } } }
4. Répondre à une question → { "response": "..." } (pas d'action)

Formats que tu comprends :
- "Emma a danse mardi de 17h à 18h"
- "Lucas a foot tous les mercredis à 14h"
- "Qu'est-ce qu'on a demain ?"
- "Annule le foot de Lucas"
- "École lundi à vendredi 8h30-16h30, mercredi 8h30-12h"

20+ activités reconnues : École, Sport, Foot, Danse, Musique, Piano, Piscine, Judo, Gym, Médecin, Dentiste, Courses, Ménage, Cuisine, Devoirs, Lecture, Sieste, Bain, Repas, Parc, Cinéma, Anniversaire, RDV, Travail, Crèche

Réponds TOUJOURS en JSON valide. Rien d'autre que du JSON.`;

function buildPrompt(message: string, context: Record<string, unknown>): string {
  const members = context.members
    ? (context.members as Array<{ name: string; role: string; emoji: string }>)
        .map((m) => `${m.emoji} ${m.name} (${m.role})`)
        .join(", ")
    : "Aucun membre";

  const events = context.events
    ? (context.events as Array<{ title: string; time: string; member?: string }>)
        .map((e) => `${e.time} - ${e.title}${e.member ? ` (${e.member})` : ""}`)
        .join("\n  ")
    : "Aucun événement";

  return `Contexte famille :
- Membres : ${members}
- Événements aujourd'hui :
  ${events}
- Date du jour : ${context.today}

Message de l'utilisateur : "${message}"`;
}

export async function POST(req: Request) {
  try {
    const { message, context } = await req.json();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildPrompt(message, context) }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return Response.json(
        { response: "Désolé, je n'ai pas pu traiter ta demande." },
        { status: 500 }
      );
    }

    const text = data.content[0].text;

    try {
      const parsed = JSON.parse(text);
      return Response.json(parsed);
    } catch {
      return Response.json({ response: text });
    }
  } catch {
    return Response.json(
      { response: "Une erreur est survenue. Réessaie !" },
      { status: 500 }
    );
  }
}
