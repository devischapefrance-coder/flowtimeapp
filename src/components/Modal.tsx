"use client";

import { useEffect, useState, useCallback } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  // Animated close
  const animatedClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setVisible(false);
      document.body.style.overflow = "";
      onClose();
    }, 250);
  }, [closing, onClose]);

  useEffect(() => {
    if (open && !closing) {
      setVisible(true);
      document.body.style.overflow = "hidden";
    } else if (!open && visible && !closing) {
      setVisible(false);
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open, visible, closing]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 flex items-end justify-center ${closing ? "modal-backdrop-out" : "modal-backdrop-in"}`}
      style={{
        zIndex: 600,
        background: "var(--overlay)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
      onClick={animatedClose}
    >
      <div
        className={`w-full ${closing ? "modal-slide-down" : "modal-slide-up"}`}
        style={{
          maxWidth: 430,
          maxHeight: "85vh",
          background: "var(--surface-solid)",
          borderRadius: "24px 24px 0 0",
          padding: "24px 20px",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
          overflowY: "auto",
          border: "1px solid var(--glass-border)",
          borderBottom: "none",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            onClick={animatedClose}
            className="w-10 h-10 flex items-center justify-center rounded-full text-xs active:scale-90 transition-transform"
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
