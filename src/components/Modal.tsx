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
  const [animState, setAnimState] = useState<"idle" | "entering" | "open" | "leaving">("idle");
  const dragY = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Direct DOM updates for 60fps drag
  const setSheetY = useCallback((y: number, animated: boolean) => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet) return;
    const t = animated ? "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)" : "none";
    sheet.style.transition = t;
    sheet.style.transform = `translate3d(0, ${y}px, 0)`;
    if (backdrop) {
      backdrop.style.transition = animated ? "opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1)" : "none";
      backdrop.style.opacity = String(Math.max(0, 1 - y / 400));
    }
  }, []);

  const closeModal = useCallback(() => {
    setAnimState("leaving");
    const h = sheetRef.current?.offsetHeight || 700;
    setSheetY(h, true);
    if (backdropRef.current) {
      backdropRef.current.style.transition = "opacity 0.3s ease";
      backdropRef.current.style.opacity = "0";
    }
    setTimeout(() => {
      setMounted(false);
      setAnimState("idle");
      document.body.style.overflow = "";
      onClose();
    }, 350);
  }, [onClose, setSheetY]);

  // Handle open/close
  useEffect(() => {
    if (open && animState === "idle") {
      setMounted(true);
      setAnimState("entering");
      document.body.style.overflow = "hidden";
    } else if (!open && (animState === "open" || animState === "entering")) {
      closeModal();
    }
  }, [open, animState, closeModal]);

  // After mount, animate in on next frame
  useEffect(() => {
    if (animState !== "entering" || !mounted) return;
    // Wait for DOM to paint the off-screen position, then slide in
    const frame1 = requestAnimationFrame(() => {
      // Ensure sheet starts off-screen
      const sheet = sheetRef.current;
      if (sheet) {
        sheet.style.transition = "none";
        sheet.style.transform = `translate3d(0, ${sheet.offsetHeight || 700}px, 0)`;
      }
      if (backdropRef.current) {
        backdropRef.current.style.transition = "none";
        backdropRef.current.style.opacity = "0";
      }
      const frame2 = requestAnimationFrame(() => {
        setSheetY(0, true);
        if (backdropRef.current) {
          backdropRef.current.style.transition = "opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1)";
          backdropRef.current.style.opacity = "1";
        }
        setAnimState("open");
      });
      return () => cancelAnimationFrame(frame2);
    });
    return () => cancelAnimationFrame(frame1);
  }, [animState, mounted, setSheetY]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { document.body.style.overflow = ""; };
  }, []);

  function onTouchStart(e: React.TouchEvent) {
    if (animState !== "open") return;
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isTopArea = touch.clientY - rect.top < 60;
    const isScrolledTop = contentRef.current ? contentRef.current.scrollTop <= 0 : true;
    if (!isTopArea && !isScrolledTop) return;

    startY.current = touch.clientY;
    dragging.current = true;
    dragY.current = 0;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
    if (backdropRef.current) backdropRef.current.style.transition = "none";
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      dragY.current = delta;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setSheetY(delta * 0.85, false);
      });
    }
  }

  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    cancelAnimationFrame(rafRef.current);

    if (dragY.current > 120) {
      closeModal();
    } else {
      setSheetY(0, true);
    }
    dragY.current = 0;
  }

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 600 }}>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.5)", opacity: 0, willChange: "opacity" }}
        onClick={closeModal}
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
          transform: "translate3d(0, 100vh, 0)",
          willChange: "transform",
          position: "relative",
          zIndex: 1,
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
              onClick={closeModal}
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
