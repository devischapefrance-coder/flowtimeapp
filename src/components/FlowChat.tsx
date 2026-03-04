"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Logo from "@/components/Logo";

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
  "Resume de la semaine",
  "Qui est libre cet apres-midi ?",
  "Ajouter un evenement",
];

function actionLabel(type: string): string {
  switch (type) {
    case "add_event": return "Evenement ajoute";
    case "delete_event": return "Evenement supprime";
    case "edit_event": return "Evenement modifie";
    case "add_recurring": return "Recurrence creee";
    default: return "Action effectuee";
  }
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1F9FF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[*_~`#]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function FlowChat({ open, onClose, context, onAction }: FlowChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "flow", text: "Salut ! Je suis Flow, ton assistant familial. Dis-moi ce que tu veux organiser, je m'occupe de tout !" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice states
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const shouldRestartListening = useRef(false);
  const voiceModeRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const processingVoiceRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      if (!voiceMode) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open, voiceMode]);

  // Check speech support
  useEffect(() => {
    const supported = typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    setSpeechSupported(supported);
  }, []);

  // Core send logic — returns Flow's response text
  const sendAndGetResponse = useCallback(async (userMsg: string): Promise<string | null> => {
    const currentMessages = messagesRef.current;
    const newMessages: Message[] = [...currentMessages, { role: "user", text: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
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

      const flowText = data.response || "C'est fait !";
      const flowMsg: Message = {
        role: "flow",
        text: flowText,
        actions: data.actions,
      };

      setMessages((prev) => [...prev, flowMsg]);

      if (data.actions && Array.isArray(data.actions) && onAction) {
        for (const action of data.actions) {
          await onAction(action);
        }
      }

      setLoading(false);
      return flowText;
    } catch {
      setMessages((prev) => [...prev, { role: "flow", text: "Oups, quelque chose n'a pas marche. Reessaie !" }]);
      setLoading(false);
      return null;
    }
  }, [context, onAction]);

  // TTS
  const speakResponse = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel();

      const cleaned = cleanForSpeech(text);
      if (!cleaned) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = "fr-FR";
      utterance.rate = 1.05;

      // Try to find a French voice
      const voices = window.speechSynthesis.getVoices();
      const frVoice = voices.find(v => v.lang.startsWith("fr") && v.localService) ||
                      voices.find(v => v.lang.startsWith("fr"));
      if (frVoice) utterance.voice = frVoice;

      utterance.onstart = () => { isSpeakingRef.current = true; setIsSpeaking(true); };
      utterance.onend = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        resolve();
      };
      utterance.onerror = () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Voice conversation loop — uses refs to avoid stale closures
  const handleVoiceInput = useCallback(async (transcript: string) => {
    if (processingVoiceRef.current) return;
    processingVoiceRef.current = true;

    // Stop listening while processing
    shouldRestartListening.current = false;
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setIsListening(false);

    // Cancel any ongoing speech (interruption)
    if (isSpeakingRef.current) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    }

    const response = await sendAndGetResponse(transcript);

    if (response && voiceModeRef.current) {
      await speakResponse(response);
    }

    processingVoiceRef.current = false;

    // Resume listening if still in voice mode
    if (voiceModeRef.current) {
      startListening();
    }
  }, [sendAndGetResponse, speakResponse]);

  // Stable ref so onresult always calls latest handleVoiceInput
  const handleVoiceInputRef = useRef(handleVoiceInput);
  handleVoiceInputRef.current = handleVoiceInput;

  // Init SpeechRecognition
  useEffect(() => {
    if (!speechSupported) return;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = "fr-FR";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0].transcript.trim();
          if (transcript) {
            handleVoiceInputRef.current(transcript);
          }
          setInterimTranscript("");
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) {
        setInterimTranscript(interim);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      if (shouldRestartListening.current) {
        setTimeout(() => {
          if (shouldRestartListening.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
              setIsListening(true);
            } catch {
              // ignore
            }
          }
        }, 200);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed" || event.error === "service-not-available") {
        shouldRestartListening.current = false;
        voiceModeRef.current = false;
        setVoiceMode(false);
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldRestartListening.current = false;
      try { recognition.abort(); } catch { /* ignore */ }
    };
  }, [speechSupported]);

  function startListening() {
    if (!recognitionRef.current) return;
    shouldRestartListening.current = true;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      // Already started
    }
  }

  function stopListening() {
    shouldRestartListening.current = false;
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setIsListening(false);
  }

  function enterVoiceMode() {
    voiceModeRef.current = true;
    setVoiceMode(true);
    setInterimTranscript("");
    startListening();
  }

  function exitVoiceMode() {
    voiceModeRef.current = false;
    setVoiceMode(false);
    stopListening();
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setInterimTranscript("");
  }

  // Cleanup when FlowChat closes
  useEffect(() => {
    if (!open) {
      exitVoiceMode();
    }
  }, [open]);

  async function send(text?: string) {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    await sendAndGetResponse(userMsg);
  }

  if (!open) return null;

  const showSuggestions = messages.length <= 1;

  const voiceStatusLabel = isSpeaking
    ? "Flow parle..."
    : loading
      ? "Flow reflechit..."
      : isListening
        ? "Je t'ecoute..."
        : "Pret";

  return (
    <div className="fixed inset-0 flex flex-col" style={{ zIndex: 700, background: "var(--bg)", maxWidth: 430, margin: "0 auto" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: "var(--nav-bg)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--glass-border)", paddingTop: "max(12px, calc(env(safe-area-inset-top, 0px) + 4px))" }}>
        <div
          className="w-10 h-10 flex items-center justify-center rounded-full text-lg"
          style={{ background: "linear-gradient(135deg, var(--accent), #9B8BFF)" }}
        >
          <Logo size={24} />
        </div>
        <div className="flex-1">
          <span className="font-bold text-sm">Flow</span>
          <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full font-bold" style={{ background: "var(--green)", color: "#fff" }}>en ligne</span>
        </div>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-xs" style={{ background: "var(--surface2)" }}>✕</button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[85%] ${m.role === "user" ? "self-end" : "self-start"} animate-in`}>
            {m.role === "flow" && (
              <div className="flex items-end gap-2">
                <div className="w-6 h-6 flex items-center justify-center rounded-full text-[10px] flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--accent), #9B8BFF)" }}><Logo size={16} /></div>
                <div>
                  <div
                    className="px-4 py-3 text-sm leading-relaxed"
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--glass-border)",
                      borderRadius: "18px 18px 18px 4px",
                    }}
                  >
                    {m.text}
                  </div>
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {m.actions.map((a, j) => (
                        <span key={j} className="text-[10px] font-bold px-2 py-1 rounded-lg" style={{ background: "rgba(94,200,158,0.12)", color: "var(--green)" }}>
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
                  background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
                  color: "#fff",
                  borderRadius: "18px 18px 4px 18px",
                }}
              >
                {m.text}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="self-start flex items-end gap-2 animate-in">
            <div className="w-6 h-6 flex items-center justify-center rounded-full text-[10px] flex-shrink-0" style={{ background: "linear-gradient(135deg, var(--accent), #9B8BFF)" }}><Logo size={16} /></div>
            <div className="px-4 py-3" style={{ background: "var(--surface)", border: "1px solid var(--glass-border)", borderRadius: "18px 18px 18px 4px" }}>
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--accent)", animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--accent)", animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: "var(--accent)", animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {showSuggestions && !loading && (
          <div className="flex flex-wrap gap-2 mt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="text-xs font-bold px-3 py-2 rounded-xl transition-all"
                style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid rgba(124,107,240,0.15)" }}
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      {voiceMode ? (
        /* Voice mode UI */
        <div className="flex flex-col items-center gap-3 p-4" style={{ background: "var(--nav-bg)", backdropFilter: "blur(20px)", borderTop: "1px solid var(--glass-border)", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          {/* Interim transcript */}
          {interimTranscript && (
            <p className="text-sm italic text-center px-4" style={{ color: "var(--dim)" }}>
              {interimTranscript}
            </p>
          )}

          {/* Status label */}
          <p className="text-xs font-bold" style={{ color: "var(--dim)" }}>
            {voiceStatusLabel}
          </p>

          {/* Mic button + speaking bars */}
          <div className="flex items-center gap-6">
            {/* Keyboard button */}
            <button
              onClick={exitVoiceMode}
              className="w-10 h-10 flex items-center justify-center rounded-full text-sm"
              style={{ background: "var(--surface2)", color: "var(--dim)" }}
              title="Retour clavier"
            >
              ⌨
            </button>

            {/* Central mic / speaker */}
            <div className="relative">
              {isListening && !isSpeaking && (
                <>
                  <div className="voice-pulse-ring" />
                  <div className="voice-pulse-ring" />
                  <div className="voice-pulse-ring" />
                </>
              )}
              <button
                className="voice-mic-btn w-16 h-16 flex items-center justify-center rounded-full text-2xl relative z-10"
                style={{
                  background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
                  color: "#fff",
                  boxShadow: isListening ? "0 0 30px var(--accent-glow)" : "0 4px 20px var(--accent-glow)",
                }}
                onClick={() => {
                  if (isSpeaking) {
                    window.speechSynthesis.cancel();
                    setIsSpeaking(false);
                  }
                }}
              >
                {isSpeaking ? (
                  <div className="voice-speaking-bars">
                    <span /><span /><span /><span /><span />
                  </div>
                ) : (
                  "🎙️"
                )}
              </button>
            </div>

            {/* Close voice button */}
            <button
              onClick={exitVoiceMode}
              className="w-10 h-10 flex items-center justify-center rounded-full text-sm"
              style={{ background: "var(--surface2)", color: "var(--red)" }}
              title="Quitter le mode vocal"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        /* Text mode UI */
        <div className="p-4 flex gap-2" style={{ background: "var(--nav-bg)", backdropFilter: "blur(20px)", borderTop: "1px solid var(--glass-border)", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          <input
            ref={inputRef}
            className="flex-1"
            placeholder="Ex: Emma a danse mardi a 17h..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          {speechSupported && (
            <button
              onClick={enterVoiceMode}
              className="w-11 h-11 flex items-center justify-center rounded-xl transition-opacity"
              style={{
                background: "var(--surface2)",
                border: "1px solid var(--glass-border)",
                flexShrink: 0,
                fontSize: 18,
              }}
              title="Mode vocal"
            >
              🎙️
            </button>
          )}
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-white font-bold transition-opacity"
            style={{
              background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
              flexShrink: 0,
              opacity: loading || !input.trim() ? 0.4 : 1,
            }}
          >
            ↑
          </button>
        </div>
      )}
    </div>
  );
}
