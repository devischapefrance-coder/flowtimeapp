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
      style={{ zIndex: 600, background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full animate-in"
        style={{
          maxWidth: 430,
          maxHeight: "85dvh",
          background: "var(--surface)",
          borderRadius: "20px 20px 0 0",
          padding: "20px",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
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
