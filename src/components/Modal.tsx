"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Animated close
  const animatedClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setVisible(false);
      setDragY(0);
      onClose();
    }, 250);
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
      setDragY(0);
      document.body.style.overflow = "hidden";
    } else if (visible && !closing) {
      // External close (e.g. setState from parent)
      setVisible(false);
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open, visible, closing]);

  function onTouchStart(e: React.TouchEvent) {
    // Allow drag from handle area (top 50px) or if content is scrolled to top
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isTopArea = touch.clientY - rect.top < 50;
    const isScrolledTop = contentRef.current ? contentRef.current.scrollTop <= 0 : true;

    if (!isTopArea && !isScrolledTop) return;
    startY.current = touch.clientY;
    dragging.current = true;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    // Only allow downward drag, with slight resistance
    if (delta > 0) {
      setDragY(delta * 0.8);
    }
  }

  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragY > 100) {
      animatedClose();
    } else {
      setDragY(0);
    }
  }

  if (!visible) return null;

  const backdropOpacity = closing ? 0 : Math.max(0.05, 0.5 - dragY / 500);

  return (
    <div
      className={`fixed inset-0 flex items-end justify-center ${closing ? "modal-backdrop-out" : "modal-backdrop-in"}`}
      style={{
        zIndex: 600,
        background: `rgba(0,0,0,${backdropOpacity})`,
        backdropFilter: `blur(${Math.max(0, 4 - dragY / 80)}px)`,
        WebkitBackdropFilter: `blur(${Math.max(0, 4 - dragY / 80)}px)`,
      }}
      onClick={animatedClose}
    >
      <div
        ref={contentRef}
        className={`w-full ${closing ? "modal-slide-down" : "modal-slide-up"}`}
        style={{
          maxWidth: 430,
          maxHeight: "85vh",
          background: "var(--surface-solid)",
          borderRadius: "24px 24px 0 0",
          padding: "24px 20px",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
          overflowY: dragging.current ? "hidden" : "auto",
          border: "1px solid var(--glass-border)",
          borderBottom: "none",
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging.current ? "none" : "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Handle bar */}
        <div className="flex justify-center mb-4">
          <div
            className="w-10 h-1 rounded-full transition-all"
            style={{
              background: dragY > 60 ? "var(--accent)" : "var(--faint)",
              width: dragY > 60 ? 48 : 40,
            }}
          />
        </div>
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
