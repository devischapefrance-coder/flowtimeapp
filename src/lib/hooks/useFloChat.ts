"use client";

import { useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { FloMessage } from "@/lib/types";

// Mots-clés de validation pour déclencher la génération de code en mode dev
const VALIDATION_WORDS = ["go", "ok", "oui", "c'est ça", "exact", "valide", "lance", "fais-le"];

function isValidation(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return VALIDATION_WORDS.some(
    (word) => normalized === word || normalized === `${word} !` || normalized === `${word}!`
  );
}

interface UseFloChatOptions {
  isDev: boolean;
  userId?: string;
}

export function useFloChat({ isDev, userId }: UseFloChatOptions) {
  const [messages, setMessages] = useState<FloMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingValidation, setIsWaitingValidation] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Charger les messages depuis Supabase (mode normal uniquement)
  const loadMessages = useCallback(async () => {
    if (isDev || !userId) return;

    const { data } = await supabase
      .from("flo_messages")
      .select("id, role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (data) {
      setMessages(
        data.map((m: { id: string; role: string; content: string; created_at: string }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: new Date(m.created_at),
        }))
      );
    }
  }, [isDev, userId]);

  // Persister un message en base (mode normal uniquement)
  const persistMessage = useCallback(
    async (role: "user" | "assistant", content: string) => {
      if (isDev || !userId) return;
      await supabase.from("flo_messages").insert({
        user_id: userId,
        role,
        content,
      });
    },
    [isDev, userId]
  );

  // Envoyer un message et recevoir la réponse en streaming
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: FloMessage = {
        role: "user",
        content: text.trim(),
        createdAt: new Date(),
      };

      // En mode dev, détecter si c'est une validation
      const isValidationMsg = isDev && isValidation(text);
      if (isValidationMsg) {
        setIsWaitingValidation(false);
      }

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      // Persister le message user (mode normal)
      await persistMessage("user", text.trim());

      // Construire l'historique pour l'API
      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const abortController = new AbortController();
        abortRef.current = abortController;

        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;

        const response = await fetch("/api/flo", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            messages: history,
            isDev,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || "Erreur serveur");
        }

        // Lire le stream SSE
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Pas de stream");

        const decoder = new TextDecoder();
        let assistantText = "";
        let buffer = "";

        // Ajouter un message assistant vide qu'on va remplir
        const assistantMessage: FloMessage = {
          role: "assistant",
          content: "",
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parser les événements SSE
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;

              try {
                const event = JSON.parse(data);

                if (event.type === "content_block_delta" && event.delta?.text) {
                  assistantText += event.delta.text;
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last && last.role === "assistant") {
                      updated[updated.length - 1] = {
                        ...last,
                        content: assistantText,
                      };
                    }
                    return updated;
                  });
                }
              } catch {
                // Ignorer les lignes JSON invalides
              }
            }
          }
        }

        // Persister la réponse complète (mode normal)
        if (assistantText) {
          await persistMessage("assistant", assistantText);

          // En mode dev, vérifier si la réponse est une reformulation
          // (contient "Dis 'go'" ou équivalent)
          if (isDev && !isValidationMsg) {
            const lowerText = assistantText.toLowerCase();
            if (
              lowerText.includes("dis 'go'") ||
              lowerText.includes("dis \"go\"") ||
              lowerText.includes("dis 'go'") ||
              lowerText.includes("confirme") ||
              lowerText.includes("valide pour")
            ) {
              setIsWaitingValidation(true);
              // Marquer le message comme reformulation
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    isReformulation: true,
                  };
                }
                return updated;
              });
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Annulé par l'utilisateur
        } else {
          const errorMessage: FloMessage = {
            role: "assistant",
            content: "Désolé, une erreur est survenue. Réessaie !",
            createdAt: new Date(),
          };
          setMessages((prev) => {
            // Remplacer le message vide par l'erreur
            const updated = [...prev];
            if (updated[updated.length - 1]?.role === "assistant" && !updated[updated.length - 1]?.content) {
              updated[updated.length - 1] = errorMessage;
            } else {
              updated.push(errorMessage);
            }
            return updated;
          });
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [isDev, isLoading, messages, persistMessage]
  );

  // Effacer la conversation
  const clearMessages = useCallback(async () => {
    setMessages([]);
    setIsWaitingValidation(false);
    if (!isDev && userId) {
      await supabase.from("flo_messages").delete().eq("user_id", userId);
    }
  }, [isDev, userId]);

  // Annuler la requête en cours
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    isWaitingValidation,
    loadMessages,
    clearMessages,
    cancel,
  };
}
