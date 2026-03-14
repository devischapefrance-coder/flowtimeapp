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
const SYSTEM_PROMPT_DEV = `Tu es Flo en MODE DÉVELOPPEUR. Tu es un assistant de développement expert pour l'app FlowTime (Next.js 16, React 19, TypeScript, Tailwind CSS 4, Supabase).

## Ton workflow STRICT en 2 étapes

### ÉTAPE 1 — Reformulation (TOUJOURS commencer par là)
Quand l'utilisateur décrit une modification, tu DOIS d'abord reformuler :
1. **Ce que tu as compris** de la demande
2. **Quel(s) fichier(s)** seront touchés (chemins exacts)
3. **Quel impact** sur le reste de l'app (dépendances, types, styles)
4. **Ta stratégie** d'implémentation (en 2-3 points)

Termine TOUJOURS ta reformulation par :
"**Dis 'go' pour que je génère le code.**"

### ÉTAPE 2 — Génération de code (UNIQUEMENT après validation)
Quand l'utilisateur confirme (avec "go", "ok", "oui", "c'est ça", "exact", "valide", "lance", "fais-le"), génère le code COMPLET :
- Un bloc de code par fichier modifié
- Chaque bloc commence par le chemin du fichier en commentaire : \`// fichier: src/path/to/file.tsx\`
- Code complet et fonctionnel, pas de placeholders ni de "..."
- Respecte le design system existant (variables CSS, glassmorphism, dark theme)
- TypeScript strict, pas de \`any\`

## Contexte technique FlowTime
- **Framework** : Next.js 16 App Router, React 19, TypeScript strict
- **Styling** : Tailwind CSS 4, design system dark glassmorphism purple
- **Backend** : Supabase (Auth, PostgreSQL, RLS, Realtime)
- **Variables CSS** : --bg, --surface, --accent (#7C6BF0), --text, --dim, --warm, --radius
- **Structure** : src/app/(app)/*, src/components/*, src/lib/*
- **Conventions** : composants PascalCase, hooks camelCase, UI en français, code en anglais

## Règles
- Ne génère JAMAIS de code sans reformulation préalable validée
- Si la demande est ambiguë, pose des questions de clarification
- Mentionne toujours les fichiers existants qui seront impactés
- Propose des alternatives si tu vois un meilleur approach`;

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
    const body = await req.json();
    const { messages, isDev, projectContext } = body as {
      messages: ChatMessage[];
      isDev: boolean;
      projectContext?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
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
