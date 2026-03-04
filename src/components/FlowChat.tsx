"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Logo from "@/components/Logo";

interface Message {
  role: "user" | "flow";
  text: string;
  image?: string; // data URL for display
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
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice UI states
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);

  // Voice refs — always up-to-date, no stale closures
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const voiceModeRef = useRef(false);
  const busyRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ─── Scroll & focus ───
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      if (!voiceMode) setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open, voiceMode]);

  // ─── Check speech support ───
  useEffect(() => {
    setSpeechSupported(
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Resize to max 1024px and convert to base64
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 1024;
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/jpeg", 0.8);
        setImageBase64(base64.split(",")[1]);
        setImagePreview(base64);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearImage() {
    setImageBase64(null);
    setImagePreview(null);
  }

  // ─── Core send logic ───
  const sendAndGetResponse = useCallback(async (userMsg: string, imgBase64?: string | null, imgPreview?: string | null): Promise<string | null> => {
    const currentMessages = messagesRef.current;
    const userMessage: Message = { role: "user", text: userMsg };
    if (imgPreview) userMessage.image = imgPreview;
    const newMessages: Message[] = [...currentMessages, userMessage];
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
        body: JSON.stringify({ message: userMsg, context, history, image: imgBase64 || undefined }),
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

  // ─── TTS with safety timeout + Chrome resume workaround ───
  const speakResponse = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) { resolve(); return; }

      window.speechSynthesis.cancel();

      const cleaned = cleanForSpeech(text);
      if (!cleaned) { resolve(); return; }

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.lang = "fr-FR";
      utterance.rate = 1.05;

      const voices = window.speechSynthesis.getVoices();
      const frVoice = voices.find(v => v.lang.startsWith("fr") && v.localService) ||
                      voices.find(v => v.lang.startsWith("fr"));
      if (frVoice) utterance.voice = frVoice;

      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(safetyTimeout);
        clearInterval(chromeResumeInterval);
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        resolve();
      };

      // Safety: resolve after max duration to never hang the loop
      const safetyTimeout = setTimeout(() => {
        window.speechSynthesis.cancel();
        done();
      }, Math.max(20000, cleaned.length * 120));

      // Chrome bug: long utterances silently pause after ~14s. Workaround: pause/resume.
      const chromeResumeInterval = setInterval(() => {
        if (resolved) return;
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 12000);

      utterance.onstart = () => { isSpeakingRef.current = true; setIsSpeaking(true); };
      utterance.onend = done;
      utterance.onerror = done;

      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // ─── Restart recognition with retry ───
  const restartRecognition = useCallback(() => {
    if (!voiceModeRef.current || !recognitionRef.current) return;

    const attempt = (delay: number, retries: number) => {
      setTimeout(() => {
        if (!voiceModeRef.current || !recognitionRef.current) return;
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch {
          if (retries > 0) {
            attempt(500, retries - 1);
          }
        }
      }, delay);
    };

    attempt(300, 2);
  }, []);

  // ─── Voice conversation handler ───
  const handleVoiceInput = useCallback(async (transcript: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsListening(false);
    setInterimTranscript("");

    try {
      // Cancel any ongoing speech (user interrupted)
      window.speechSynthesis.cancel();
      isSpeakingRef.current = false;
      setIsSpeaking(false);

      const response = await sendAndGetResponse(transcript);

      if (response && voiceModeRef.current) {
        await speakResponse(response);
      }
    } finally {
      busyRef.current = false;
      if (voiceModeRef.current) {
        restartRecognition();
      }
    }
  }, [sendAndGetResponse, speakResponse, restartRecognition]);

  // Stable ref so the recognition onresult always calls the latest version
  const handleVoiceInputRef = useRef(handleVoiceInput);
  handleVoiceInputRef.current = handleVoiceInput;

  // ─── Init SpeechRecognition ───
  useEffect(() => {
    if (!speechSupported) return;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = "fr-FR";
    recognition.continuous = false; // Single phrase — more reliable across browsers
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
          return; // Stop processing — handleVoiceInput takes over
        } else {
          interim += result[0].transcript;
        }
      }
      if (interim) setInterimTranscript(interim);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Auto-restart if in voice mode and not processing/speaking
      // This handles: Safari auto-stop, "no-speech" timeout, "aborted" errors
      if (voiceModeRef.current && !busyRef.current) {
        setTimeout(() => {
          if (voiceModeRef.current && !busyRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
              setIsListening(true);
            } catch {
              // Will be retried on next onend or by restartRecognition
            }
          }
        }, 300);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed" || event.error === "service-not-available") {
        voiceModeRef.current = false;
        setVoiceMode(false);
        setIsListening(false);
      }
      // "no-speech", "aborted", "network" → onend will fire and handle restart
    };

    recognitionRef.current = recognition;

    return () => {
      try { recognition.abort(); } catch { /* ignore */ }
    };
  }, [speechSupported]);

  // ─── Voice mode controls ───
  function enterVoiceMode() {
    voiceModeRef.current = true;
    busyRef.current = false;
    setVoiceMode(true);
    setInterimTranscript("");
    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        restartRecognition();
      }
    }
  }

  function exitVoiceMode() {
    voiceModeRef.current = false;
    busyRef.current = false;
    setVoiceMode(false);
    setIsListening(false);
    setInterimTranscript("");
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }

  // Cleanup when FlowChat closes
  useEffect(() => {
    if (!open && voiceModeRef.current) {
      exitVoiceMode();
    }
  }, [open]);

  async function send(text?: string) {
    const userMsg = (text || input).trim();
    if (!userMsg || loading) return;
    const img = imageBase64;
    const preview = imagePreview;
    setInput("");
    clearImage();
    await sendAndGetResponse(userMsg, img, preview);
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
                className="text-sm overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
                  color: "#fff",
                  borderRadius: "18px 18px 4px 18px",
                }}
              >
                {m.image && (
                  <img src={m.image} alt="Photo envoyée" className="w-full max-h-48 object-cover" style={{ borderRadius: "18px 18px 0 0" }} />
                )}
                <div className="px-4 py-3">{m.text}</div>
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
          {interimTranscript && (
            <p className="text-sm italic text-center px-4" style={{ color: "var(--dim)" }}>
              {interimTranscript}
            </p>
          )}

          <p className="text-xs font-bold" style={{ color: "var(--dim)" }}>
            {voiceStatusLabel}
          </p>

          <div className="flex items-center gap-6">
            <button
              onClick={exitVoiceMode}
              className="w-10 h-10 flex items-center justify-center rounded-full text-sm"
              style={{ background: "var(--surface2)", color: "var(--dim)" }}
              title="Retour clavier"
            >
              ⌨
            </button>

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
                    isSpeakingRef.current = false;
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
        <div className="p-4" style={{ background: "var(--nav-bg)", backdropFilter: "blur(20px)", borderTop: "1px solid var(--glass-border)", paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
          {imagePreview && (
            <div className="flex items-center gap-2 mb-2">
              <img src={imagePreview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
              <span className="text-[10px]" style={{ color: "var(--dim)" }}>Image jointe</span>
              <button onClick={clearImage} className="text-xs ml-auto" style={{ color: "var(--red)" }}>✕</button>
            </div>
          )}
          <div className="flex gap-2">
          <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageSelect} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-11 h-11 flex items-center justify-center rounded-xl transition-opacity shrink-0"
            style={{ background: "var(--surface2)", border: "1px solid var(--glass-border)", fontSize: 16 }}
            title="Envoyer une photo"
          >
            📷
          </button>
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
        </div>
      )}
    </div>
  );
}
