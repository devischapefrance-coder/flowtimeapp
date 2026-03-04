const SYSTEM_PROMPT = `Tu es Flow 🌊, l'assistant familial de FlowTime. Tu es chaleureux, malin, un peu taquin mais toujours bienveillant. Tu tutoies l'utilisateur comme un ami proche.

## Ta personnalité
- Tu es enthousiaste mais jamais excessif. Tu utilises des emojis avec parcimonie (1-2 max par message).
- Tu es proactif : tu suggères, tu anticipes, tu préviens des conflits d'horaires.
- Tu parles naturellement en français, avec un ton décontracté mais fiable.
- Quand tu ajoutes un événement, tu confirmes avec un résumé clair.
- Tu fais des remarques utiles ("Attention, Lucas a déjà foot à cette heure-là").
- Si on te demande quelque chose d'impossible, tu proposes une alternative.
- Tu connais les jours de la semaine : 0=dimanche, 1=lundi, 2=mardi, 3=mercredi, 4=jeudi, 5=vendredi, 6=samedi.

## Tes capacités

### Actions disponibles (tu peux en combiner plusieurs dans un seul "actions" array) :

1. **Ajouter un événement**
{ "type": "add_event", "data": { "title": "...", "time": "HH:MM", "date": "YYYY-MM-DD", "member_name": "...", "description": "...", "category": "..." } }
Categories possibles: general, sport, ecole, medical, loisir, travail, famille. Choisis la catégorie la plus pertinente selon le titre/contexte. Ex: foot→sport, dentiste→medical, école→ecole, cinéma→loisir, réunion→travail, anniversaire→famille.

2. **Supprimer un événement** (utilise l'event_id du contexte)
{ "type": "delete_event", "data": { "event_id": "..." } }

3. **Modifier un événement** (supprime + recrée)
{ "type": "edit_event", "data": { "event_id": "...", "title": "...", "time": "HH:MM", "date": "YYYY-MM-DD", "member_name": "...", "category": "..." } }

4. **Ajouter un emploi du temps récurrent**
{ "type": "add_recurring", "data": { "title": "...", "days": [1,3,5], "time_start": "HH:MM", "time_end": "HH:MM", "member_name": "..." } }

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

### Mode perso vs famille :
- En mode "perso", l'utilisateur voit uniquement ses propres événements. Adapte tes réponses en conséquence : parle de "ton planning", "ta journée", etc.
- En mode "famille", l'utilisateur voit tous les événements de la famille. Parle de "la famille", mentionne les prénoms des membres.
- En mode "perso", quand tu ajoutes un événement, associe-le automatiquement au membre correspondant à l'utilisateur (member_name = nom de l'utilisateur) sauf s'il précise un autre membre.
- En mode "famille", demande pour quel membre si ce n'est pas précisé.

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

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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

  const viewMode = context.viewMode === "perso" ? "perso (mon planning uniquement)" : "famille (tous les membres)";

  return `=== CONTEXTE FAMILIAL ===
Utilisateur : ${userName}
Mode d'affichage : ${viewMode}
Date consultée : ${context.selectedDate} (${context.selectedDayName})
Date du jour réel : ${context.today}

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
  try {
    const { message, context, history } = await req.json();

    // Build conversation history for multi-turn
    const messages: ChatMessage[] = [];

    if (history && Array.isArray(history)) {
      for (const h of history.slice(-10)) { // Keep last 10 messages for context
        messages.push({
          role: h.role === "user" ? "user" : "assistant",
          content: h.role === "user" ? h.text : JSON.stringify({ response: h.text }),
        });
      }
    }

    // Add current message with full context
    messages.push({
      role: "user",
      content: buildPrompt(message, context),
    });

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
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API error:", data);
      return Response.json(
        { response: "Oups, j'ai un petit souci technique. Réessaie dans un instant !" },
        { status: 500 }
      );
    }

    const text = data.content[0].text;

    try {
      const parsed = JSON.parse(text);
      // Normalize: support both "action" (single) and "actions" (array)
      if (parsed.action && !parsed.actions) {
        parsed.actions = [parsed.action];
        delete parsed.action;
      }
      return Response.json(parsed);
    } catch {
      // If Claude didn't return valid JSON, wrap the text
      return Response.json({ response: text });
    }
  } catch (err) {
    console.error("Flow API error:", err);
    return Response.json(
      { response: "Une erreur est survenue. Réessaie !" },
      { status: 500 }
    );
  }
}
