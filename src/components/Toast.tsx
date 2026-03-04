"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

type ToastType = "success" | "error" | "info" | "undo";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  onUndo?: () => void;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
  toastUndo: (message: string, onUndo: () => void) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
  toastUndo: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 3500);
  }, [removeToast]);

  const toastUndo = useCallback((message: string, onUndo: () => void) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type: "undo", onUndo }]);
    setTimeout(() => removeToast(id), 6000);
  }, [removeToast]);

  const typeStyles: Record<ToastType, { bg: string; icon: string }> = {
    success: { bg: "var(--green)", icon: "✓" },
    error: { bg: "var(--red)", icon: "✕" },
    info: { bg: "var(--accent)", icon: "ℹ" },
    undo: { bg: "var(--surface2)", icon: "↩" },
  };

  return (
    <ToastContext.Provider value={{ toast, toastUndo }}>
      {children}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[900] flex flex-col gap-2 items-center" style={{ maxWidth: 400, width: "90%" }}>
        {toasts.map((t) => {
          const style = typeStyles[t.type];
          return (
            <div
              key={t.id}
              className="flex items-center gap-2.5 px-4 py-3 rounded-2xl text-sm font-medium w-full shadow-lg"
              style={{
                background: t.type === "undo" ? "var(--surface-solid)" : style.bg,
                color: t.type === "undo" ? "var(--text)" : "#fff",
                border: t.type === "undo" ? "1px solid var(--glass-border)" : "none",
                animation: "slideUp 0.3s ease-out",
              }}
            >
              <span className="text-base shrink-0">{style.icon}</span>
              <span className="flex-1 truncate">{t.message}</span>
              {t.type === "undo" && t.onUndo && (
                <button
                  className="text-xs font-bold px-2.5 py-1 rounded-lg shrink-0"
                  style={{ background: "var(--accent)", color: "#fff" }}
                  onClick={() => { t.onUndo?.(); removeToast(t.id); }}
                >
                  Annuler
                </button>
              )}
              <button
                className="text-xs opacity-60 shrink-0"
                onClick={() => removeToast(t.id)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
