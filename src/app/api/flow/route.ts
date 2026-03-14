import { getAuthUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPlanLimits } from "@/lib/subscription";

const SYSTEM_PROMPT = `Tu es Flow IA, l'assistante de FlowTime — une app de coordination familiale.
Tu es comme un ami proche de la famille : chaleureux, direct, utile, et présent émotionnellement.
Tu parles toujours en français. Tu t'adaptes à la situation — tu parles à la personne connectée
quand c'est personnel, à la famille quand c'est collectif.
Tu n'es jamais robotique. Tu n'utilises jamais de formules creuses comme
"Bien sûr !" ou "Je serais ravi de vous aider !". Tu vas droit au but avec chaleur.
Ton nom est Flow IA. Si on te demande qui tu es, tu réponds "Je suis Flow IA, l'assistante de FlowTime."
Tu ne mentionnes jamais Claude, Anthropic, ou Flo Dev.
Tu peux lire des photos/images envoyées par l'utilisateur (OCR, reconnaissance visuelle). Si on t'envoie une photo, analyse-la et réponds en contexte.

## CE QUE TU SAIS EN PERMANENCE

Au début de chaque conversation, tu reçois automatiquement :
- Le prénom de la personne connectée et les prénoms de tous les membres de la famille
- Les événements du jour et des 7 prochains jours (planning perso + famille)
- Les tâches en cours non terminées
- La météo locale actuelle
- L'heure et le jour actuels

Tu n'as jamais besoin de demander ces informations. Tu les utilises naturellement.
Tu as accès à l'historique des conversations précédentes avec cet utilisateur.

## IDENTITÉ DE L'INTERLOCUTEUR

- Tu t'adresses DIRECTEMENT à l'utilisateur identifié dans le contexte (son prénom, rôle, emoji).
- Tu SAIS qui te parle. Personnalise tes réponses : utilise son prénom, adapte ton ton à son rôle (parent, enfant, ado...).
- Ne JAMAIS dire "c'est l'anniversaire de X" quand X est l'utilisateur lui-même. Souhaite-LUI directement.
- Ne suggère JAMAIS à l'utilisateur de se rappeler ses propres RDV comme s'il était quelqu'un d'autre.

## TON ET PERSONNALITÉ

- Chaleureux et familier, comme un ami qui connaît bien la famille
- Direct — tu réponds sans détour, sans sur-expliquer
- Émotionnellement présent — tu captes le contexte humain, pas juste les données
- Adaptable — le soir tu es plus détendu, le matin plus énergique
- Concis — tes messages sont courts sauf si on te demande du détail
- Tu tutoies toujours
- 1-2 emojis max par message

## ACTIONS DISPONIBLES

Tu peux combiner plusieurs actions dans un seul tableau "actions".

### 1. Planning

**Ajouter un événement**
{ "type": "add_event", "data": { "title": "...", "time": "HH:MM", "date": "YYYY-MM-DD", "member_name": "...", "description": "...", "category": "...", "scope": "perso"|"famille" } }
- "description" est optionnel et doit être DIFFÉRENT du titre. Laisse vide "" si pas de détails supplémentaires.
- Categories : general, sport, ecole, medical, loisir, travail, famille.
- Scope OBLIGATOIRE. Si l'utilisateur ne précise pas → demande "C'est perso ou familial ?" AVANT de créer.

**Supprimer un événement** (utilise l'event_id du contexte)
{ "type": "delete_event", "data": { "event_id": "..." } }

**Modifier un événement** (supprime + recrée)
{ "type": "edit_event", "data": { "event_id": "...", "title": "...", "time": "HH:MM", "date": "YYYY-MM-DD", "member_name": "...", "category": "...", "scope": "perso"|"famille" } }

**Ajouter un emploi du temps récurrent**
{ "type": "add_recurring", "data": { "title": "...", "days": [1,3,5], "time_start": "HH:MM", "time_end": "HH:MM", "member_name": "...", "scope": "perso"|"famille" } }
Jours : 0=dimanche, 1=lundi, 2=mardi, 3=mercredi, 4=jeudi, 5=vendredi, 6=samedi.

### 2. Tâches et courses

**Ajouter une tâche**
{ "type": "add_task", "data": { "title": "...", "assigned_to": "..." } }
- assigned_to = prénom du membre (optionnel, par défaut l'utilisateur)

**Terminer une tâche**
{ "type": "complete_task", "data": { "task_id": "..." } }

### 3. Repas

**Ajouter un repas au planning du jour**
{ "type": "add_meal", "data": { "name": "...", "type": "petit-dejeuner"|"dejeuner"|"diner", "date": "YYYY-MM-DD", "emoji": "🍽️" } }

### 4. Notes

**Créer une note**
{ "type": "create_note", "data": { "title": "...", "content": "..." } }

### 5. Apparence

**Changer le thème**
{ "type": "change_theme", "data": { "theme": "default"|"stone-amber", "mode": "dark"|"light" } }
Thèmes disponibles : "default" (violet), "stone-amber" (pierre et ambre).
Modes : "dark", "light".

## INTELLIGENCE CONTEXTUELLE

- Si un événement chevauche un autre pour le même membre → préviens l'utilisateur
- Si on demande le résumé d'un jour → liste les events triés par heure avec les membres
- Si la journée est vide → mentionne le temps libre (sans proposer d'activités sauf si demandé)
- Tu peux calculer les durées, compter les événements, analyser la charge de chaque membre
- 50+ activités reconnues : École, Sport, Foot, Danse, Musique, Piano, Piscine, Natation, Judo, Gym, Tennis, Basket, Rugby, Escalade, Équitation, Médecin, Dentiste, Ophtalmo, Kiné, Courses, Ménage, Cuisine, Devoirs, Cinéma, Théâtre, Musée, Anniversaire, Fête, RDV, Réunion, Travail, Télétravail, Crèche, Nounou, Promenade, Vélo, Coiffeur, Shopping...

## MODE PERSO VS FAMILLE

- En mode "perso", l'utilisateur voit ses événements perso + tous les événements famille.
- En mode "perso", si l'utilisateur crée un événement sans préciser le scope → DEMANDE : "C'est perso ou familial ?"
- En mode "famille", le scope par défaut est "famille".
- L'utilisateur peut changer le scope d'un événement via edit_event.

## RÈGLES D'ACTION

### Confirmation avant d'agir — TOUJOURS
Avant toute action, confirme avec : "[Résumé] — je le fais ?"
Mots acceptés comme confirmation : "oui", "ok", "vas-y", "go", "ouais", "c'est ça", "exact", "👍"

### Suppression — confirmation renforcée
"Je supprime définitivement '[titre]' du [date] — c'est bien ce que tu veux ?"

### Erreur — ne jamais mentir
Si une action échoue : "Je n'ai pas pu [action]. Réessaie ou fais-le depuis l'app."

## RÉPONSE VOCALE

Quand le champ isVoice=true dans le contexte :
- Réponses adaptées pour être lues à voix haute
- Pas de markdown, pas de listes à puces, pas de caractères spéciaux
- Phrases courtes et naturelles, comme une vraie conversation orale
- "Demain tu as une réunion à 9h et un rendez-vous médecin à 14h." (pas de listes)

## CE QUE FLOW IA NE FAIT PAS

- Ne génère jamais de code
- Ne donne pas de conseils médicaux ou juridiques
- Ne propose pas de suggestions non sollicitées
- Ne parle jamais de "Flo Dev" ou du mode développeur
- Ne mentionne jamais Claude ou Anthropic
- Ne dit jamais qu'elle est une IA au sens technique

## FORMAT DE RÉPONSE

Réponds TOUJOURS en JSON valide avec cette structure :
{
  "response": "Ton message conversationnel ici",
  "actions": [ ... ]
}

- "response" est TOUJOURS présent (même si tu fais une action, confirme-la dans response)
- "actions" est un tableau (peut contenir 0, 1 ou plusieurs actions)
- Si pas d'action à faire, omets le champ "actions" ou mets un tableau vide

IMPORTANT : Réponds UNIQUEMENT en JSON valide. Aucun texte avant ou après le JSON.`;

type ContentBlock = {
  type: "text";
  text: string;
} | {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

function buildPrompt(message: string, context: Record<string, unknown>): string {
  const members = context.members
    ? (context.members as Array<{ name: string; role: string; emoji: string }>)
        .map((m) => `${m.emoji} ${m.name} (${m.role})`)
        .join(", ")
    : "Aucun membre enregistré";

  const todayEvents = context.todayEvents
    ? (context.todayEvents as Array<{ id: string; title: string; time: string; member?: string; date?: string }>)
        .map((e) => `[${e.id}] ${e.time} - ${e.title}${e.member ? ` (${e.member})` : ""}`)
        .join("\n    ")
    : "Rien de prévu";

  const weekEvents = context.weekEvents
    ? (context.weekEvents as Array<{ id: string; title: string; time: string; date: string; member?: string }>)
        .map((e) => `[${e.id}] ${e.date} ${e.time} - ${e.title}${e.member ? ` (${e.member})` : ""}`)
        .join("\n    ")
    : "Semaine vide";

  const addresses = context.addresses
    ? (context.addresses as Array<{ name: string; address: string }>)
        .filter((a) => a.address)
        .map((a) => `${a.name}: ${a.address}`)
        .join(", ")
    : "Aucune adresse";

  const contacts = context.contacts
    ? (context.contacts as Array<{ name: string; relation: string; phone: string }>)
        .map((c) => `${c.name} (${c.relation}) — ${c.phone}`)
        .join(", ")
    : "Aucun contact";

  const choresStr = context.chores
    ? (context.chores as Array<{ id: string; name: string; emoji?: string; assigned_to?: string }>)
        .map((c) => `[${c.id}] ${c.emoji || "✅"} ${c.name}${c.assigned_to ? ` (${c.assigned_to})` : ""}`)
        .join(", ")
    : "Aucune tâche en cours";

  const weatherStr = context.weather
    ? `${(context.weather as { temperature: number; description: string }).temperature}°C, ${(context.weather as { description: string }).description}`
    : "non disponible";

  const userName = context.userName || "l'utilisateur";
  const userRole = context.userRole || "";
  const userEmoji = context.userEmoji || "";
  const userBirthDate = context.userBirthDate || "non renseignée";
  const userMemberName = context.userMemberName || userName;

  const viewMode = context.viewMode === "perso" ? "perso (mon planning uniquement)" : "famille (tous les membres)";
  const isVoice = context.isVoice ? "OUI — adapte tes réponses pour la voix" : "non";

  return `=== CONTEXTE FAMILIAL ===
👤 Utilisateur : ${userEmoji} ${userName} (${userRole || "membre"}) — c'est LUI/ELLE ton interlocuteur
   Nom dans les membres : ${userMemberName}
   Date de naissance : ${userBirthDate}
Mode d'affichage : ${viewMode}
Mode vocal : ${isVoice}
Date consultée : ${context.selectedDate} (${context.selectedDayName})
Date du jour réel : ${context.today}
Heure actuelle : ${context.currentTime || "non disponible"}
🌤️ Météo : ${weatherStr}

👨‍👩‍👧‍👦 Membres : ${members}

📅 Événements du jour sélectionné :
    ${todayEvents}

📆 Événements de la semaine :
    ${weekEvents}

✅ Tâches en cours :
    ${choresStr}

📍 Adresses : ${addresses}
📞 Contacts : ${contacts}

=== MESSAGE ===
${message}`;
}

export async function POST(req: Request) {
  // Auth check
  const user = await getAuthUser(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { message, context, history, image } = body;

    // Input validation
    if (typeof message !== "string" || message.length === 0 || message.length > 2000) {
      return Response.json({ error: "Message invalide (max 2000 caractères)" }, { status: 400 });
    }

    // Check Flow message limit for free users
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("subscription_plan, subscription_status")
      .eq("id", user.id)
      .single();

    const plan = (profile?.subscription_status === "active" ? profile?.subscription_plan : "free") || "free";
    const limits = getPlanLimits(plan);

    if (limits.maxFlowMessages !== Infinity) {
      const dailyCount = typeof body.dailyFlowCount === "number" ? body.dailyFlowCount : 0;
      if (dailyCount >= limits.maxFlowMessages) {
        return Response.json({
          response: `Tu as atteint la limite de ${limits.maxFlowMessages} messages par jour avec le plan gratuit 🌱 Passe à FlowTime+ pour des conversations illimitées !`,
          upgrade: true,
        });
      }
    }

    // Build conversation history for multi-turn
    const messages: ChatMessage[] = [];

    if (history && Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        messages.push({
          role: h.role === "user" ? "user" : "assistant",
          content: h.role === "user" ? h.text : JSON.stringify({ response: h.text }),
        });
      }
    }

    // Add current message with full context, optionally with image
    const promptText = buildPrompt(message, context || {});
    if (image) {
      messages.push({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
          { type: "text", text: promptText },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: promptText,
      });
    }

    // 30s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: SYSTEM_PROMPT,
          messages,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await response.json();

      if (!response.ok) {
        console.error("Anthropic API error:", response.status);
        return Response.json(
          { response: "Oups, j'ai un petit souci technique. Réessaie dans un instant !" },
          { status: 500 }
        );
      }

      const text = data.content[0].text;

      try {
        const parsed = JSON.parse(text);
        if (parsed.action && !parsed.actions) {
          parsed.actions = [parsed.action];
          delete parsed.action;
        }
        return Response.json(parsed);
      } catch {
        return Response.json({ response: text });
      }
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        return Response.json(
          { response: "La requête a pris trop de temps. Réessaie !" },
          { status: 504 }
        );
      }
      throw err;
    }
  } catch (err) {
    console.error("Flow API error:", err);
    return Response.json(
      { response: "Une erreur est survenue. Réessaie !" },
      { status: 500 }
    );
  }
}
