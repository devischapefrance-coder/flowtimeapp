"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useFloChat } from "@/lib/hooks/useFloChat";
import type { FloMessage } from "@/lib/types";
// Icônes SVG inline (pas de dépendance externe)
function IconSend({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function IconTrash({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}
function IconCopy({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  );
}
function IconCheck({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconSquare({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

interface FloChatProps {
  isDev: boolean;
  userId?: string;
}

// Parser les blocs de code dans le contenu markdown
function parseCodeBlocks(content: string): Array<{ type: "text" | "code"; content: string; lang?: string; filePath?: string }> {
  const parts: Array<{ type: "text" | "code"; content: string; lang?: string; filePath?: string }> = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Texte avant le bloc de code
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }

    const lang = match[1] || "";
    const code = match[2];

    // Détecter le chemin du fichier dans la première ligne du code
    let filePath: string | undefined;
    const firstLine = code.split("\n")[0];
    const filePathMatch = firstLine?.match(/^\/\/\s*fichier\s*:\s*(.+)/i) ||
      firstLine?.match(/^\/\/\s*file\s*:\s*(.+)/i) ||
      firstLine?.match(/^\/\/\s*(.+\.(tsx?|jsx?|css|sql|json|md))\s*$/i);

    if (filePathMatch) {
      filePath = filePathMatch[1].trim();
    }

    parts.push({
      type: "code",
      content: filePath ? code.split("\n").slice(1).join("\n") : code,
      lang,
      filePath,
    });

    lastIndex = match.index + match[0].length;
  }

  // Texte restant après le dernier bloc
  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  if (parts.length === 0) {
    parts.push({ type: "text", content });
  }

  return parts;
}

// Composant pour un bloc de code
function CodeBlock({ code, lang, filePath }: { code: string; lang?: string; filePath?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Header du bloc de code */}
      <div
        className="flex items-center justify-between px-3 py-2 text-xs"
        style={{
          background: "var(--surface2)",
          color: "var(--dim)",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <span className="font-mono truncate">{filePath || lang || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-150"
          style={{
            background: copied ? "color-mix(in srgb, var(--green) 15%, transparent)" : "var(--surface)",
            color: copied ? "var(--green)" : "var(--dim)",
          }}
        >
          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          {copied ? "Copié" : "Copier"}
        </button>
      </div>
      {/* Corps du code */}
      <pre className="p-3 overflow-x-auto text-sm leading-relaxed" style={{ color: "var(--text)" }}>
        <code style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>{code.trim()}</code>
      </pre>
    </div>
  );
}

// Rendu sécurisé du markdown inline (sans dangerouslySetInnerHTML)
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex combinée pour bold et inline code
  const regex = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Texte avant le match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      // Bold
      nodes.push(<strong key={key++}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      // Inline code
      nodes.push(
        <code key={key++} style={{ background: "var(--surface2)", padding: "1px 4px", borderRadius: 4, fontSize: "0.85em", fontFamily: "monospace" }}>
          {match[2]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  // Texte restant
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

// Composant pour le rendu du texte markdown simplifié
function MessageContent({ content }: { content: string }) {
  const parts = parseCodeBlocks(content);

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "code") {
          return <CodeBlock key={i} code={part.content} lang={part.lang} filePath={part.filePath} />;
        }

        // Rendu basique du markdown inline (sécurisé, sans innerHTML)
        const lines = part.content.split("\n");
        return (
          <div key={i}>
            {lines.map((line, j) => {
              // Headers
              if (line.startsWith("### ")) {
                return <h4 key={j} className="font-semibold mt-3 mb-1 text-sm" style={{ color: "var(--text)" }}>{line.slice(4)}</h4>;
              }
              if (line.startsWith("## ")) {
                return <h3 key={j} className="font-bold mt-3 mb-1" style={{ color: "var(--text)" }}>{line.slice(3)}</h3>;
              }
              // Liste
              if (line.startsWith("- ") || line.startsWith("* ")) {
                return <div key={j} className="flex gap-2 ml-2 my-0.5"><span style={{ color: "var(--accent)" }}>•</span><span>{renderInlineMarkdown(line.slice(2))}</span></div>;
              }
              // Numérotée
              const numberedMatch = line.match(/^(\d+)\.\s(.+)/);
              if (numberedMatch) {
                return <div key={j} className="flex gap-2 ml-2 my-0.5"><span style={{ color: "var(--accent)" }}>{numberedMatch[1]}.</span><span>{renderInlineMarkdown(numberedMatch[2])}</span></div>;
              }
              // Ligne vide
              if (!line.trim()) return <div key={j} className="h-2" />;
              // Paragraphe
              return <p key={j} className="my-0.5">{renderInlineMarkdown(line)}</p>;
            })}
          </div>
        );
      })}
    </>
  );
}

// Bulle de message
function MessageBubble({
  message,
  isDev,
  onGo,
}: {
  message: FloMessage;
  isDev: boolean;
  onGo?: () => void;
}) {
  const isUser = message.role === "user";
  const isReformulation = message.isReformulation;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3 animate-in`}>
      <div
        className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
        style={{
          ...(isUser
            ? {
                background: isDev
                  ? "color-mix(in srgb, var(--warm) 15%, transparent)"
                  : "var(--accent-soft)",
                color: "var(--text)",
                borderBottomRightRadius: "4px",
              }
            : {
                background: "var(--surface)",
                color: "var(--text)",
                borderBottomLeftRadius: "4px",
                ...(isReformulation
                  ? {
                      borderLeft: "3px solid var(--warm)",
                      background: "color-mix(in srgb, var(--warm) 6%, transparent)",
                    }
                  : {}),
              }),
        }}
      >
        <MessageContent content={message.content} />

        {/* Bouton "Go" sous les reformulations */}
        {isReformulation && onGo && (
          <button
            onClick={onGo}
            className="flex items-center gap-2 mt-3 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150"
            style={{
              background: "color-mix(in srgb, var(--warm) 15%, transparent)",
              color: "var(--warm)",
              border: "1px solid color-mix(in srgb, var(--warm) 25%, transparent)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "color-mix(in srgb, var(--warm) 25%, transparent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "color-mix(in srgb, var(--warm) 15%, transparent)";
            }}
          >
            Go →
          </button>
        )}
      </div>
    </div>
  );
}

// Indicateur de frappe
function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="rounded-2xl px-4 py-3" style={{ background: "var(--surface)" }}>
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--dim)", animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--dim)", animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--dim)", animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

export default function FloChat({ isDev, userId }: FloChatProps) {
  const {
    messages,
    sendMessage,
    isLoading,
    isWaitingValidation,
    loadMessages,
    clearMessages,
    cancel,
  } = useFloChat({ isDev, userId });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasLoadedRef = useRef(false);

  // Charger les messages au montage (mode normal)
  useEffect(() => {
    if (!userId) return;
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    loadMessages();
  }, [userId, loadMessages]);

  // Auto-scroll vers le bas
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Auto-resize du textarea
  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
    }
  }, []);

  useEffect(() => adjustTextarea(), [input, adjustTextarea]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGo = () => {
    sendMessage("go");
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{
          background: isDev ? "color-mix(in srgb, var(--warm) 8%, transparent)" : "var(--surface)",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
            style={{
              background: isDev
                ? "linear-gradient(135deg, var(--warm), color-mix(in srgb, var(--warm) 70%, #fff))"
                : "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #fff))",
            }}
          >
            {isDev ? "⚡" : "🌊"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-base" style={{ color: "var(--text)" }}>
                Flo
              </h2>
              {isDev && (
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-md"
                  style={{
                    background: "color-mix(in srgb, var(--warm) 15%, transparent)",
                    color: "var(--warm)",
                    border: "1px solid color-mix(in srgb, var(--warm) 25%, transparent)",
                  }}
                >
                  MODE DEV
                </span>
              )}
            </div>
            {!isDev && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--dim)" }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--green)" }} />
                En ligne
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isLoading && (
            <button
              onClick={cancel}
              className="p-2 rounded-xl transition-all duration-150"
              style={{ color: "var(--red)", background: "color-mix(in srgb, var(--red) 10%, transparent)" }}
              title="Annuler"
            >
              <IconSquare size={16} />
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="p-2 rounded-xl transition-all duration-150"
              style={{ color: "var(--dim)", background: "var(--surface)" }}
              title="Effacer la conversation"
            >
              <IconTrash size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ overscrollBehavior: "contain" }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mb-4"
              style={{
                background: isDev
                  ? "color-mix(in srgb, var(--warm) 10%, transparent)"
                  : "var(--accent-soft)",
              }}
            >
              {isDev ? "⚡" : "🌊"}
            </div>
            <h3 className="font-semibold mb-2" style={{ color: "var(--text)" }}>
              {isDev ? "Mode Développeur" : "Salut ! Je suis Flo"}
            </h3>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              {isDev
                ? "Décris une modification et je la reformulerai avant de coder."
                : "Comment puis-je t'aider aujourd'hui ?"}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg}
            isDev={isDev}
            onGo={msg.isReformulation && isWaitingValidation ? handleGo : undefined}
          />
        ))}

        {isLoading && messages[messages.length - 1]?.role !== "assistant" && <TypingIndicator />}
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-4 py-3"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--glass-border)",
        }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl px-3 py-2"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--glass-border)",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isDev
                ? "Décris une modification à faire..."
                : "Pose une question à Flo..."
            }
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm py-1.5"
            style={{
              color: "var(--text)",
              maxHeight: "120px",
              fontFamily: "inherit",
            }}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-xl transition-all duration-150 shrink-0"
            style={{
              background:
                input.trim() && !isLoading
                  ? isDev
                    ? "linear-gradient(135deg, var(--warm), color-mix(in srgb, var(--warm) 70%, #fff))"
                    : "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #fff))"
                  : "var(--surface2)",
              color: input.trim() && !isLoading ? "#fff" : "var(--dim)",
            }}
          >
            <IconSend size={16} />
          </button>
        </div>

        {/* Indicateur de validation en attente */}
        {isWaitingValidation && (
          <div
            className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl text-xs"
            style={{
              background: "color-mix(in srgb, var(--warm) 8%, transparent)",
              color: "var(--warm)",
              border: "1px solid color-mix(in srgb, var(--warm) 15%, transparent)",
            }}
          >
            ⚡
            En attente de ta validation pour générer le code
          </div>
        )}
      </div>
    </div>
  );
}
