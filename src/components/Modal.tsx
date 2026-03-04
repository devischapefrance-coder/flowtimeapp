"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const dragY = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const doClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      setMounted(false);
      document.body.style.overflow = "";
      onClose();
    }, 300);
  }, [closing, onClose]);

  useEffect(() => {
    if (open && !mounted && !closing) {
      setMounted(true);
      document.body.style.overflow = "hidden";
    } else if (!open && mounted && !closing) {
      doClose();
    }
  }, [open, mounted, closing, doClose]);

  useEffect(() => {
    return () => { document.body.style.overflow = ""; };
  }, []);

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isTopArea = touch.clientY - rect.top < 60;
    const isScrolledTop = contentRef.current ? contentRef.current.scrollTop <= 0 : true;
    if (!isTopArea && !isScrolledTop) return;

    startY.current = touch.clientY;
    dragging.current = true;
    dragY.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      dragY.current = delta;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transition = "none";
          sheetRef.current.style.transform = `translateY(${delta * 0.85}px)`;
        }
      });
    }
  }

  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    cancelAnimationFrame(rafRef.current);

    if (sheetRef.current) {
      if (dragY.current > 120) {
        doClose();
      } else {
        sheetRef.current.style.transition = "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
        sheetRef.current.style.transform = "translateY(0)";
      }
    }
    dragY.current = 0;
  }

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 600 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.5)",
          animation: closing
            ? "modalFadeOut 0.3s ease forwards"
            : "modalFadeIn 0.3s ease forwards",
        }}
        onClick={doClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          width: "100%",
          maxWidth: 430,
          maxHeight: "85vh",
          background: "var(--surface-solid)",
          borderRadius: "24px 24px 0 0",
          padding: "24px 20px",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
          border: "1px solid var(--glass-border)",
          borderBottom: "none",
          position: "relative",
          zIndex: 1,
          animation: closing
            ? "modalSheetOut 0.3s cubic-bezier(0.32, 0.72, 0, 1) forwards"
            : "modalSheetIn 0.35s cubic-bezier(0.32, 0.72, 0, 1) forwards",
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          ref={contentRef}
          style={{ maxHeight: "calc(85vh - 100px)", overflowY: "auto" }}
        >
          {/* Handle bar */}
          <div className="flex justify-center mb-4">
            <div className="w-10 h-1 rounded-full" style={{ background: "var(--faint)" }} />
          </div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold">{title}</h2>
            <button
              onClick={doClose}
              className="w-10 h-10 flex items-center justify-center rounded-full text-xs active:scale-90 transition-transform"
              style={{ background: "var(--surface2)" }}
            >
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
