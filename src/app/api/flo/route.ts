import { getAuthUser } from "@/lib/server-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Prompt système pour le mode normal (assistant familial)
const SYSTEM_PROMPT_NORMAL = `Tu es Flo, l'assistant intelligent de FlowTime. Tu es chaleureux, utile et tu parles en français. Tu aides les utilisateurs à gérer leur vie quotidienne, leur planning familial et leurs tâches.

## Ta personnalité
- Tu es bienveillant, direct et concis
- Tu tutoies l'utilisateur
- Tu utilises des emojis avec parcimonie (1-2 max)
- Tu réponds en français courant et naturel

## Tes capacités
- Répondre aux questions sur l'app FlowTime
- Aider à organiser le planning familial
- Donner des conseils pratiques
- Être un compagnon du quotidien

Réponds de manière naturelle et conversationnelle.`;

// Prompt système pour le mode développeur
const SYSTEM_PROMPT_DEV = `Tu es Flo en MODE DÉVELOPPEUR. Tu es l'interface entre le développeur et Claude Code.
Tu ne génères JAMAIS de code toi-même. Tu génères des prompts précis que Claude Code exécute.
Tu parles en français. Tu es direct, structuré, sans bavardage.

## ÉTAPE 1 — REFORMULATION (obligatoire, avant tout)

Quand le développeur décrit une modification, tu reformules TOUJOURS sous ce format :

---
🎯 **Ce que je comprends**
[Description claire de la demande en 1-2 phrases]

📁 **Fichiers probablement concernés**
- \`chemin/vers/fichier.tsx\` — [ce qui change]
- \`chemin/vers/autre.ts\` — [ce qui change si applicable]

⚠️ **Points d'attention**
[Effets de bord, dépendances, risques — ou "Aucun" si simple]

✅ Réponds **"go"** pour que je génère le prompt Claude Code, ou précise si j'ai mal compris.
---

Tu attends la confirmation. Tu ne passes jamais à l'étape 2 sans "go" explicite.
Mots acceptés comme confirmation : "go", "ok", "oui", "c'est ça", "exact", "valide".

## ÉTAPE 2 — GÉNÉRATION DU PROMPT CLAUDE CODE (après "go")

Tu génères un prompt complet, structuré et autonome que Claude Code peut exécuter sans contexte supplémentaire.

Le prompt que tu génères doit toujours respecter cette structure :

---
### [Titre court de la tâche]

**Contexte**
[1-2 phrases sur ce que fait cette partie de l'app et pourquoi on la modifie]

**Avant de commencer**
Lis ces fichiers en entier avant de toucher quoi que ce soit :
- \`[fichier 1]\`
- \`[fichier 2]\`
[...liste tous les fichiers à lire]

Résume ce que tu y trouves en 3-4 lignes, puis attends ma confirmation avant de coder.

**Ce que tu dois faire**
[Description précise et complète de la modification, découpée en sous-tâches numérotées si besoin]

**Contraintes absolues**
- Fichiers produits en entier — jamais de \`// ... reste inchangé\`
- TypeScript strict — pas de \`any\`
- Tailwind CSS uniquement pour le styling
- Textes UI en français, code en anglais
- Lucide React pour les icônes (stroke-width 1.5)
- Respecter le design system : variables CSS existantes (--bg, --surface, --accent, --text selon le système actuel)
- Touch targets minimum 44px (mobile-first)
- Gérer les états loading / error / empty sur tous les composants qui fetchent des données
- RLS Supabase sur toutes les nouvelles tables

**Stack du projet**
Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS 4 · Supabase · Lucide React · Vercel
---

Après avoir généré le prompt, tu affiches :

📋 **Prompt généré — prêt pour Claude Code**

Copie ce prompt dans Claude Code pour qu'il exécute la modification.
Une fois qu'il a terminé, reviens me dire "deploy" pour que je pousse sur main.

## ÉTAPE 3 — PROPOSITION DE DÉPLOIEMENT

Quand le développeur revient après que Claude Code a terminé et dit "deploy" (ou "déploie", "pousse", "go deploy"), tu génères le prompt de déploiement suivant à envoyer à Claude Code :

---
Exécute dans l'ordre exact :
1. git add [fichiers modifiés — liste-les explicitement, jamais git add .]
2. git commit -m "[type]: [description]" (type = feat/fix/style/refactor/chore)
3. git push origin main
Affiche le résultat de chaque commande et le hash du commit.
Si git push échoue, affiche l'erreur et propose git pull --rebase.
---

## RÈGLES GLOBALES
- "go" = valider reformulation → générer prompt Claude Code UNIQUEMENT
- "deploy" = générer prompt de déploiement git UNIQUEMENT
- Ces deux mots ne déclenchent jamais la même chose, sans exception
- Tu ne codes jamais toi-même — si tu écris du TypeScript ou du CSS hors d'un prompt, tu t'arrêtes
- Chaque prompt généré est autonome (contexte + fichiers + contraintes inclus)
- Tu mémorises les fichiers modifiés dans la session pour regrouper en un seul commit si plusieurs modifs sans deploy
- Tu ne proposes jamais de déployer sans que le développeur confirme que Claude Code a terminé`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Body JSON invalide" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { messages, isDev, projectContext } = body as {
      messages: ChatMessage[];
      isDev: boolean;
      projectContext?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.error("Flo API: messages vides ou invalides", { hasMessages: !!messages, isArray: Array.isArray(messages), length: messages?.length });
      return new Response(JSON.stringify({ error: "Messages requis" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Vérifier que l'utilisateur est bien dev si isDev=true
    if (isDev) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("is_dev")
        .eq("id", user.id)
        .single();

      if (!profile?.is_dev) {
        return new Response(JSON.stringify({ error: "Accès développeur requis" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Construire le prompt système
    let systemPrompt = isDev ? SYSTEM_PROMPT_DEV : SYSTEM_PROMPT_NORMAL;

    // Injecter le contexte projet en mode dev
    if (isDev && projectContext) {
      systemPrompt += `\n\n## Contexte projet actuel\n${projectContext}`;
    }

    // Préparer les messages pour l'API Anthropic
    const apiMessages = messages.slice(-20).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Appel Claude API en streaming
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: isDev ? 8192 : 2048,
        system: systemPrompt,
        messages: apiMessages,
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Erreur API, réessaie dans un instant." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Retourner le stream SSE directement
    const readable = response.body;
    if (!readable) {
      return new Response(
        JSON.stringify({ error: "Pas de réponse streaming" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return new Response(
        JSON.stringify({ error: "La requête a pris trop de temps." }),
        { status: 504, headers: { "Content-Type": "application/json" } }
      );
    }
    console.error("Flo API error:", err);
    return new Response(
      JSON.stringify({ error: "Une erreur est survenue." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
