"use client";

import { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 600, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full animate-in"
        style={{
          maxWidth: 430,
          maxHeight: "85dvh",
          background: "var(--surface-solid)",
          borderRadius: "24px 24px 0 0",
          padding: "24px 20px",
          overflowY: "auto",
          border: "1px solid var(--glass-border)",
          borderBottom: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--faint)" }} />
        </div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-xs"
            style={{ background: "var(--surface2)" }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
