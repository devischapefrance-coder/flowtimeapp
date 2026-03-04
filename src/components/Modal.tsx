"use client";

import { useEffect, useRef, useState } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      setDragY(0);
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function onTouchStart(e: React.TouchEvent) {
    // Only start drag from the handle area (top 44px of modal)
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (touch.clientY - rect.top > 44) return;
    startY.current = touch.clientY;
    dragging.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setDragY(delta);
  }

  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragY > 80) {
      onClose();
    }
    setDragY(0);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{
        zIndex: 600,
        background: `rgba(0,0,0,${Math.max(0.1, 0.5 - dragY / 400)})`,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        className="w-full modal-slide-up"
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
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging.current ? "none" : "transform 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Handle bar */}
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full" style={{ background: "var(--faint)" }} />
        </div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full text-xs"
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
