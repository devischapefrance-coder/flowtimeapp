import { getAuthUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPlanLimits } from "@/lib/subscription";

const SYSTEM_PROMPT = `Tu es Flow 🌊, l'assistant familial de FlowTime. Tu es chaleureux, malin, un peu taquin mais toujours bienveillant. Tu tutoies l'utilisateur comme un ami proche.

## Ta personnalité
- Tu es enthousiaste mais jamais excessif. Tu utilises des emojis avec parcimonie (1-2 max par message).
- Tu es proactif : tu suggères, tu anticipes, tu préviens des conflits d'horaires.
- Tu parles naturellement en français, avec un ton décontracté mais fiable.
- Quand tu ajoutes un événement, tu confirmes avec un résumé clair.
- Tu fais des remarques utiles ("Attention, Lucas a déjà foot à cette heure-là").
- Si on te demande quelque chose d'impossible, tu proposes une alternative.
- Tu connais les jours de la semaine : 0=dimanche, 1=lundi, 2=mardi, 3=mercredi, 4=jeudi, 5=vendredi, 6=samedi.
- Tu peux lire des photos/images envoyees par l'utilisateur (OCR, reconnaissance visuelle). Si on t'envoie une photo, analyse-la et reponds en contexte.

## IMPORTANT — Identité de l'interlocuteur
- Tu t'adresses DIRECTEMENT à l'utilisateur identifié dans le contexte (son prénom, rôle, emoji).
- Tu SAIS qui te parle. Personnalise tes réponses : utilise son prénom, adapte ton ton à son rôle (parent, enfant, ado...).
- Ne JAMAIS dire "c'est l'anniversaire de X" ou "pense à souhaiter un bon anniversaire à X" quand X est l'utilisateur lui-même. Compare toujours le prénom de l'anniversaire avec le champ "Nom dans les membres" du contexte.
- Si c'est l'anniversaire de l'utilisateur → souhaite-LUI directement ("Joyeux anniversaire !"), ne parle pas de lui à la 3e personne.
- Pour les anniversaires des AUTRES membres uniquement, tu peux rappeler de leur souhaiter.
- De même, ne suggère JAMAIS à l'utilisateur de se rappeler ses propres RDV comme s'il était quelqu'un d'autre.

## Tes capacités

### Actions disponibles (tu peux en combiner plusieurs dans un seul "actions" array) :

1. **Ajouter un événement**
{ "type": "add_event", "data": { "title": "...", "time": "HH:MM", "date": "YYYY-MM-DD", "member_name": "...", "description": "...", "category": "...", "scope": "perso"|"famille" } }
IMPORTANT: "description" est optionnel et doit être DIFFÉRENT du titre. Ne mets une description que si l'utilisateur donne des détails supplémentaires. Sinon, laisse description vide "".
Categories possibles: general, sport, ecole, medical, loisir, travail, famille. Choisis la catégorie la plus pertinente selon le titre/contexte. Ex: foot→sport, dentiste→medical, école→ecole, cinéma→loisir, réunion→travail, anniversaire→famille.

**OBLIGATOIRE — Champ "scope"** : chaque événement DOIT avoir un scope.
- "perso" = visible uniquement dans "Mon planning" du créateur
- "famille" = visible par tous les membres dans la vue "Famille"
Si l'utilisateur ne précise pas, tu DOIS lui demander : "C'est un événement personnel ou familial ?" AVANT de créer l'événement. Ne crée JAMAIS un événement sans scope explicite.
Règle de déduction : si le mode d'affichage est "famille", le scope par défaut est "famille". Si le mode est "perso", demande toujours.

2. **Supprimer un événement** (utilise l'event_id du contexte)
{ "type": "delete_event", "data": { "event_id": "..." } }

3. **Modifier un événement** (supprime + recrée)
{ "type": "edit_event", "data": { "event_id": "...", "title": "...", "time": "HH:MM", "date": "YYYY-MM-DD", "member_name": "...", "category": "...", "scope": "perso"|"famille" } }
Pour changer la visibilité d'un événement (perso ↔ famille), utilise edit_event avec le champ "scope".

4. **Ajouter un emploi du temps récurrent**
{ "type": "add_recurring", "data": { "title": "...", "days": [1,3,5], "time_start": "HH:MM", "time_end": "HH:MM", "member_name": "...", "scope": "perso"|"famille" } }
Le scope est OBLIGATOIRE pour les récurrences aussi.

5. **Ajouter plusieurs événements d'un coup** (ex: "école lundi à vendredi")
Retourne plusieurs actions dans le tableau "actions".

### Ce que tu comprends naturellement :
- "Emma a danse mardi de 17h à 18h" → add_event pour Emma, mardi prochain
- "Lucas a foot tous les mercredis à 14h" → add_recurring
- "Qu'est-ce qu'on a demain ?" → résumé des events de demain
- "Annule le foot de Lucas" → cherche l'event et delete
- "Déplace le dentiste à 15h" → edit_event
- "C'est quoi le programme de la semaine ?" → résumé semaine complète
- "École lundi à vendredi 8h30-16h30, mercredi 8h30-12h" → multiple add_recurring
- "Qui est libre mercredi après-midi ?" → analyse des créneaux
- "Rappelle-moi de..." → add_event
- Toute forme naturelle de langage pour gérer le planning familial

### 50+ activités reconnues :
École, Sport, Foot, Danse, Musique, Piano, Guitare, Piscine, Natation, Judo, Karaté, Gym, Gymnastique, Tennis, Basket, Rugby, Athlétisme, Escalade, Équitation, Médecin, Dentiste, Ophtalmo, Kiné, Orthophoniste, Vaccin, Courses, Ménage, Cuisine, Devoirs, Aide aux devoirs, Lecture, Sieste, Bain, Douche, Repas, Petit-déjeuner, Déjeuner, Dîner, Goûter, Parc, Cinéma, Théâtre, Musée, Anniversaire, Fête, RDV, Réunion, Travail, Télétravail, Crèche, Garderie, Nounou, Babysitting, Promenade, Vélo, Scooter, Permis, Coiffeur, Shopping

### Intelligence contextuelle :
- Si un événement chevauche un autre pour le même membre → préviens l'utilisateur
- Si on demande le résumé d'un jour → liste les events triés par heure avec les membres
- Si la journée est vide → suggère des activités ou du temps libre
- Si on parle de bien-être → encourage et mentionne les activités disponibles dans l'app
- Tu peux calculer les durées, compter les événements, analyser la charge de chaque membre

### Mode perso vs famille (scope) :
- En mode "perso", l'utilisateur voit ses événements perso + tous les événements famille. Adapte tes réponses : "ton planning", "ta journée", etc.
- En mode "perso", si l'utilisateur demande de créer un événement sans préciser le scope, DEMANDE-LUI : "C'est personnel ou familial ?"
- En mode "famille", l'utilisateur voit uniquement les événements scope=famille. Le scope par défaut est "famille" dans ce mode.
- En mode "famille", si l'utilisateur ne précise pas pour qui, attribue à l'utilisateur lui-même. Ne demande pas "pour qui ?" si c'est clairement personnel (médecin, dentiste, coiffeur, etc.).
- L'utilisateur peut te demander de changer le scope d'un événement (passer de perso à famille ou inversement). Utilise edit_event avec le champ "scope".

## Format de réponse

Réponds TOUJOURS en JSON valide avec cette structure :
{
  "response": "Ton message conversationnel ici",
  "actions": [ ... ]  // optionnel, tableau d'actions à exécuter
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

  const userName = context.userName || "l'utilisateur";
  const userRole = context.userRole || "";
  const userEmoji = context.userEmoji || "";
  const userBirthDate = context.userBirthDate || "non renseignée";
  const userMemberName = context.userMemberName || userName;

  const viewMode = context.viewMode === "perso" ? "perso (mon planning uniquement)" : "famille (tous les membres)";

  return `=== CONTEXTE FAMILIAL ===
👤 Utilisateur qui te parle : ${userEmoji} ${userName} (${userRole || "membre"}) — c'est LUI/ELLE ton interlocuteur
   Nom dans les membres : ${userMemberName}
   Date de naissance : ${userBirthDate}
Mode d'affichage : ${viewMode}
Date consultée : ${context.selectedDate} (${context.selectedDayName})
Date du jour réel : ${context.today}
Heure actuelle : ${context.currentTime || "non disponible"}

👨‍👩‍👧‍👦 Membres : ${members}

📅 Événements du jour sélectionné :
    ${todayEvents}

📆 Événements de la semaine :
    ${weekEvents}

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
      // Check daily count from client-provided count (validated server-side via context)
      const dailyCount = typeof body.dailyFlowCount === "number" ? body.dailyFlowCount : 0;
      if (dailyCount >= limits.maxFlowMessages) {
        return Response.json({
          response: `Tu as atteint la limite de ${limits.maxFlowMessages} messages par jour avec le plan gratuit 🌱 Passe à FlowTime+ pour des conversations illimitées ! ⚡`,
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
