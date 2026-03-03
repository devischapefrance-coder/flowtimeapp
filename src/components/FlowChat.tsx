"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "flow";
  text: string;
}

interface FlowChatProps {
  open: boolean;
  onClose: () => void;
  context: Record<string, unknown>;
  onAction?: (action: { type: string; data: Record<string, unknown> }) => void;
}

export default function FlowChat({ open, onClose, context, onAction }: FlowChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "flow", text: "Salut ! Je suis Flow, ton assistant familial. Comment puis-je t'aider ?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, context }),
      });
      const data = await res.json();

      if (data.response) {
        setMessages((prev) => [...prev, { role: "flow", text: data.response }]);
      }
      if (data.action && onAction) {
        onAction(data.action);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "flow", text: "Désolé, une erreur est survenue. Réessaie !" }]);
    }

    setLoading(false);
  }

  if (!open) return null;

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
        <span className="font-extrabold flex-1">Flow</span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-sm" style={{ background: "var(--surface2)" }}>✕</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] ${m.role === "user" ? "self-end" : "self-start"}`}>
            <div
              className="px-4 py-3 text-sm"
              style={{
                background: m.role === "user" ? "var(--accent)" : "var(--surface)",
                color: m.role === "user" ? "#fff" : "var(--text)",
                borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="self-start px-4 py-3 rounded-2xl" style={{ background: "var(--surface)" }}>
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--dim)", animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--dim)", animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--dim)", animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 flex gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <input
          className="flex-1"
          placeholder="Écris un message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button
          onClick={send}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-white font-bold"
          style={{ background: "linear-gradient(135deg, var(--accent), #FFA559)", flexShrink: 0 }}
        >
          →
        </button>
      </div>
    </div>
  );
}
