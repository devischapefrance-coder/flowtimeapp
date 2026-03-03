"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "flow";
  text: string;
  actions?: Array<{ type: string; data: Record<string, unknown> }>;
}

interface FlowChatProps {
  open: boolean;
  onClose: () => void;
  context: Record<string, unknown>;
  onAction?: (action: { type: string; data: Record<string, unknown> }) => void;
}

const SUGGESTIONS = [
  "Qu'est-ce qu'on a aujourd'hui ?",
  "Résumé de la semaine",
  "Qui est libre cet après-midi ?",
  "Ajouter un événement",
];

function actionLabel(type: string): string {
  switch (type) {
    case "add_event": return "Événement ajouté";
    case "delete_event": return "Événement supprimé";
    case "edit_event": return "Événement modifié";
    case "add_recurring": return "Récurrence créée";
    default: return "Action effectuée";
  }
}

export default function FlowChat({ open, onClose, context, onAction }: FlowChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "flow", text: "Salut ! Je suis Flow 🌊 ton assistant familial. Dis-moi ce que tu veux organiser, je m'occupe de tout !" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function send(text?: string) {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", text: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Send conversation history for multi-turn
      const history = newMessages.slice(-12).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await fetch("/api/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, context, history }),
      });
      const data = await res.json();

      const flowMsg: Message = {
        role: "flow",
        text: data.response || "C'est fait !",
        actions: data.actions,
      };

      setMessages((prev) => [...prev, flowMsg]);

      // Execute actions
      if (data.actions && Array.isArray(data.actions) && onAction) {
        for (const action of data.actions) {
          await onAction(action);
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "flow", text: "Oups, quelque chose n'a pas marché. Réessaie !" }]);
    }

    setLoading(false);
  }

  if (!open) return null;

  const showSuggestions = messages.length <= 1;

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 700, background: "var(--bg)", maxWidth: 430, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div
          className="w-10 h-10 flex items-center justify-center rounded-full text-lg"
          style={{ background: "linear-gradient(135deg, var(--accent), #FFA559)" }}
        >
          🌊
        </div>
        <div className="flex-1">
          <span className="font-extrabold">Flow</span>
          <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--green)", color: "#fff" }}>en ligne</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-sm" style={{ background: "var(--surface2)" }}>✕</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] ${m.role === "user" ? "self-end" : "self-start"} animate-in`}>
            {m.role === "flow" && (
              <div className="flex items-end gap-2">
                <div className="w-6 h-6 flex items-center justify-center rounded-full text-xs flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--accent), #FFA559)" }}>🌊</div>
                <div>
                  <div
                    className="px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: "var(--surface)",
                      borderRadius: "16px 16px 16px 4px",
                    }}
                  >
                    {m.text}
                  </div>
                  {/* Action confirmations */}
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {m.actions.map((a, j) => (
                        <span key={j} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(107,203,119,0.15)", color: "var(--green)" }}>
                          ✓ {actionLabel(a.type)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {m.role === "user" && (
              <div
                className="px-4 py-3 text-sm"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  borderRadius: "16px 16px 4px 16px",
                }}
              >
                {m.text}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="self-start flex items-end gap-2 animate-in">
            <div className="w-6 h-6 flex items-center justify-center rounded-full text-xs flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--accent), #FFA559)" }}>🌊</div>
            <div className="px-4 py-3 rounded-2xl" style={{ background: "var(--surface)", borderRadius: "16px 16px 16px 4px" }}>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--accent)", animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--accent)", animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--accent)", animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {/* Suggestions */}
        {showSuggestions && !loading && (
          <div className="flex flex-wrap gap-2 mt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="text-xs font-bold px-3 py-2 rounded-xl transition-colors"
                style={{ background: "var(--surface2)", color: "var(--accent)" }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 flex gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
        <input
          ref={inputRef}
          className="flex-1"
          placeholder="Ex: Emma a danse mardi à 17h..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-white font-bold transition-opacity"
          style={{
            background: "linear-gradient(135deg, var(--accent), #FFA559)",
            flexShrink: 0,
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
