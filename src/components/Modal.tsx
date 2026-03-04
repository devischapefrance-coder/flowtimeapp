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
  const [show, setShow] = useState(false);
  const dragY = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Apply transform directly on the DOM for 60fps (no React re-render)
  const applyTransform = useCallback((y: number, animated: boolean) => {
    if (!sheetRef.current) return;
    sheetRef.current.style.transform = `translateY(${y}px) translateZ(0)`;
    sheetRef.current.style.transition = animated
      ? "transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)"
      : "none";
    // Backdrop opacity based on drag
    if (backdropRef.current) {
      const opacity = Math.max(0, 1 - y / 400);
      backdropRef.current.style.opacity = String(opacity);
      backdropRef.current.style.transition = animated
        ? "opacity 0.35s cubic-bezier(0.32, 0.72, 0, 1)"
        : "none";
    }
  }, []);

  // Open
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Force a frame so the initial translateY(100%) is painted, then animate to 0
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShow(true);
        });
      });
      document.body.style.overflow = "hidden";
    } else if (mounted) {
      // Close with animation
      setShow(false);
      const timer = setTimeout(() => {
        setMounted(false);
        document.body.style.overflow = "";
      }, 350);
      return () => clearTimeout(timer);
    }
    return () => { document.body.style.overflow = ""; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sync show state to DOM transforms
  useEffect(() => {
    if (!mounted) return;
    if (show) {
      applyTransform(0, true);
    } else {
      // Slide out to bottom
      const sheetHeight = sheetRef.current?.offsetHeight || 600;
      applyTransform(sheetHeight, true);
    }
  }, [show, mounted, applyTransform]);

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const isTopArea = touch.clientY - rect.top < 60;
    const isScrolledTop = contentRef.current ? contentRef.current.scrollTop <= 0 : true;
    if (!isTopArea && !isScrolledTop) return;

    startY.current = touch.clientY;
    dragging.current = true;
    dragY.current = 0;
    // Kill any ongoing transition for immediate response
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = "none";
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      dragY.current = delta;
      // Use rAF for smooth 60fps updates
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyTransform(delta * 0.85, false);
      });
    }
  }

  function onTouchEnd() {
    if (!dragging.current) return;
    dragging.current = false;
    cancelAnimationFrame(rafRef.current);

    if (dragY.current > 120) {
      // Dismiss
      const sheetHeight = sheetRef.current?.offsetHeight || 600;
      applyTransform(sheetHeight, true);
      setTimeout(() => {
        setMounted(false);
        setShow(false);
        document.body.style.overflow = "";
        onClose();
      }, 350);
    } else {
      // Snap back
      applyTransform(0, true);
    }
    dragY.current = 0;
  }

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: 600 }}>
      {/* Backdrop — separate layer for GPU compositing */}
      <div
        ref={backdropRef}
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.5)",
          opacity: 0,
          willChange: "opacity",
        }}
        onClick={() => {
          setShow(false);
          setTimeout(() => {
            setMounted(false);
            document.body.style.overflow = "";
            onClose();
          }, 350);
        }}
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
          transform: "translateY(100%) translateZ(0)",
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
          style={{ maxHeight: "calc(85vh - 100px)", overflowY: dragging.current ? "hidden" : "auto" }}
        >
          {/* Handle bar */}
          <div className="flex justify-center mb-4">
            <div
              className="w-10 h-1 rounded-full"
              style={{ background: "var(--faint)" }}
            />
          </div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold">{title}</h2>
            <button
              onClick={() => {
                setShow(false);
                setTimeout(() => {
                  setMounted(false);
                  document.body.style.overflow = "";
                  onClose();
                }, 350);
              }}
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
