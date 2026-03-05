"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface QuickVoiceProps {
  context: Record<string, unknown>;
  onAction?: (action: { type: string; data: Record<string, unknown> }) => void;
}

export default function QuickVoice({ context, onAction }: QuickVoiceProps) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  const handleResult = useCallback(async (transcript: string) => {
    setListening(false);
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/flow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ message: transcript, context, history: [] }),
      });
      const data = await res.json();
      const text = data.response || "C'est fait !";
      setToast(text.slice(0, 120));
      setTimeout(() => setToast(null), 4000);

      if (data.actions && Array.isArray(data.actions) && onAction) {
        for (const action of data.actions) {
          await onAction(action);
        }
      }
    } catch {
      setToast("Erreur, reessaie !");
      setTimeout(() => setToast(null), 3000);
    }
    setProcessing(false);
  }, [context, onAction]);

  function stopListening() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }

  function toggleListening() {
    if (processing) return;
    if (listening) {
      stopListening();
      return;
    }
    if (!supported) return;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    recognition.lang = "fr-FR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) handleResult(transcript);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  if (!supported) return null;

  return (
    <>
      {/* Floating button */}
      <button
        className="fixed flex items-center justify-center rounded-full text-lg z-40"
        style={{
          bottom: "calc(160px + env(safe-area-inset-bottom, 0px))",
          right: "max(20px, calc(50% - 195px))",
          width: 46,
          height: 46,
          background: listening
            ? "linear-gradient(135deg, var(--red), #FF8A9E)"
            : processing
              ? "linear-gradient(135deg, var(--warm), #FFB86C)"
              : "linear-gradient(135deg, var(--accent), var(--teal))",
          border: "2px solid rgba(255,255,255,0.15)",
          boxShadow: listening
            ? "0 4px 20px rgba(240,107,126,0.5), 0 0 12px rgba(240,107,126,0.3)"
            : processing
              ? "0 4px 20px rgba(240,160,75,0.4)"
              : "0 6px 20px var(--accent-glow)",
          color: "#fff",
        }}
        onClick={toggleListening}
        disabled={processing}
      >
        {processing ? (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : listening ? (
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white" />
          </span>
        ) : (
          "🎙️"
        )}
      </button>

      {/* Toast */}
      {toast && (
        <div
          className="fixed left-4 right-4 z-50 animate-in"
          style={{
            bottom: "calc(220px + env(safe-area-inset-bottom, 0px))",
            maxWidth: 398,
            margin: "0 auto",
          }}
        >
          <div
            className="px-4 py-3 rounded-2xl text-sm font-medium"
            style={{
              background: "var(--surface-solid)",
              border: "1px solid var(--glass-border)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              color: "var(--text)",
            }}
          >
            {toast}
          </div>
        </div>
      )}
    </>
  );
}
