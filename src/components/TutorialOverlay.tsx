"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { TUTORIAL_STEPS, TUTORIAL_SECTIONS, getSectionForStep, getFirstStepIndex } from "@/lib/tutorial-data";
import type { TutorialStep } from "@/lib/tutorial-data";

interface TutorialOverlayProps {
  active: boolean;
  step: number;
  onNext: () => void;
  onPrev: () => void;
  onStop: () => void;
  onSkipSection: () => void;
  onJumpToSection: (section: string) => void;
}

export default function TutorialOverlay({
  active, step, onNext, onPrev, onStop, onSkipSection, onJumpToSection,
}: TutorialOverlayProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tooltipKey, setTooltipKey] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [interactionDone, setInteractionDone] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [successAnim, setSuccessAnim] = useState(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listenerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const currentStep = TUTORIAL_STEPS[step] as TutorialStep | undefined;
  const isFullscreen = !currentStep?.targetAttr;
  const total = TUTORIAL_STEPS.length;
  const isFinal = currentStep?.id === "done";
  const section = getSectionForStep(step);
  const isInteractive = !!currentStep?.interaction;

  // Reset interaction state on step change
  useEffect(() => {
    setInteractionDone(false);
    setShowFallback(false);
    setSuccessAnim(false);
    setSectionPickerOpen(false);
    setTooltipKey((k) => k + 1);

    if (fallbackRef.current) clearTimeout(fallbackRef.current);
    if (currentStep?.interaction) {
      fallbackRef.current = setTimeout(() => setShowFallback(true), 8000);
    }

    return () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, [step, currentStep?.interaction]);

  // Cleanup interaction listener
  const cleanupListener = useCallback(() => {
    if (listenerRef.current) {
      listenerRef.current();
      listenerRef.current = null;
    }
  }, []);

  // Setup interaction listener on target element
  const setupInteractionListener = useCallback((el: HTMLElement) => {
    cleanupListener();
    if (!currentStep?.interaction) return;

    const handler = () => {
      setSuccessAnim(true);
      setInteractionDone(true);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      setTimeout(() => onNext(), 800);
    };

    if (currentStep.interaction === "swipe") {
      let startX = 0;
      const onTouchStart = (e: TouchEvent) => { startX = e.touches[0].clientX; };
      const onTouchEnd = (e: TouchEvent) => {
        const diff = Math.abs(e.changedTouches[0].clientX - startX);
        if (diff > 40) handler();
      };
      el.addEventListener("touchstart", onTouchStart, { passive: true });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
      listenerRef.current = () => {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchend", onTouchEnd);
      };
    } else {
      el.addEventListener("click", handler, { once: true });
      listenerRef.current = () => el.removeEventListener("click", handler);
    }
  }, [currentStep?.interaction, cleanupListener, onNext]);

  // Find target element with retries
  const findTarget = useCallback(() => {
    if (!active || !currentStep) return;
    if (!currentStep.targetAttr) {
      setRect(null);
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;

    function tryFind() {
      const el = document.querySelector(`[data-tutorial="${currentStep!.targetAttr}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          setRect(el.getBoundingClientRect());
          setupInteractionListener(el);
        }, 350);
      } else if (attempts < maxAttempts) {
        attempts++;
        retryRef.current = setTimeout(tryFind, 300);
      } else {
        setRect(null);
      }
    }

    tryFind();
  }, [active, currentStep, setupInteractionListener]);

  // Navigate cross-page if needed
  useEffect(() => {
    if (!active || !currentStep) return;

    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    cleanupListener();

    if (pathname !== currentStep.page) {
      setTransitioning(true);
      router.push(currentStep.page);
      setTimeout(() => {
        setTransitioning(false);
        findTarget();
      }, 600);
    } else {
      findTarget();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, pathname]);

  // Recalculate rect on scroll/resize
  useEffect(() => {
    if (!active || !currentStep?.targetAttr) return;

    function recalc() {
      const el = document.querySelector(`[data-tutorial="${currentStep!.targetAttr}"]`) as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    }

    window.addEventListener("scroll", recalc, true);
    window.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("scroll", recalc, true);
      window.removeEventListener("resize", recalc);
    };
  }, [active, currentStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      cleanupListener();
    };
  }, [cleanupListener]);

  if (!active || !currentStep || !mounted) return null;

  const padding = 12;

  // Progress dots
  const dots = TUTORIAL_STEPS.map((s, i) => ({
    done: i < step,
    current: i === step,
    section: s.section,
  }));

  // Spotlight rect values
  const sx = rect ? rect.left - padding : 0;
  const sy = rect ? rect.top - padding : 0;
  const sw = rect ? rect.width + padding * 2 : 0;
  const sh = rect ? rect.height + padding * 2 : 0;
  const sr = 16;

  // Tooltip position
  let tooltipStyle: React.CSSProperties = {
    position: "fixed",
    width: 340,
    maxWidth: "calc(100vw - 24px)",
    zIndex: 810,
    left: "50%",
    transform: "translateX(-50%)",
  };

  if (isFullscreen || !rect) {
    tooltipStyle.top = "50%";
    tooltipStyle.transform = "translate(-50%, -50%)";
  } else if (currentStep.position === "bottom") {
    tooltipStyle.top = Math.min(rect.bottom + padding + 16, window.innerHeight - 260);
  } else {
    const topY = rect.top - padding - 16;
    tooltipStyle.bottom = `calc(100vh - ${topY}px)`;
  }

  // Arrow for non-fullscreen
  const arrowStyle: React.CSSProperties | null =
    !isFullscreen && rect
      ? {
          position: "absolute" as const,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          ...(currentStep.position === "bottom"
            ? { top: -8, borderBottom: "8px solid rgba(30,30,45,0.95)" }
            : { bottom: -8, borderTop: "8px solid rgba(30,30,45,0.95)" }),
        }
      : null;

  // Hint icon SVG
  function renderHintIcon() {
    if (!currentStep?.hintIcon) return null;
    if (currentStep.hintIcon === "swipe") {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      );
    }
    if (currentStep.hintIcon === "toggle") {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="5" width="22" height="14" rx="7"/>
          <circle cx="16" cy="12" r="4"/>
        </svg>
      );
    }
    // tap
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V22"/>
        <path d="M8 6a4 4 0 0 1 8 0"/>
      </svg>
    );
  }

  const overlay = (
    <div style={{ position: "fixed", inset: 0, zIndex: 800 }}>
      {/* Transition fade */}
      {transitioning && (
        <div
          style={{
            position: "fixed", inset: 0, background: "#000", zIndex: 850,
            animation: "tutoFadeInOut 0.6s ease-in-out",
          }}
        />
      )}

      {/* SVG overlay with spotlight mask */}
      {isFullscreen || !rect ? (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)" }}
          onClick={onStop}
        />
      ) : (
        <svg
          style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 800 }}
          onClick={(e) => {
            const x = e.clientX;
            const y = e.clientY;
            if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) return;
          }}
        >
          <defs>
            <mask id="tuto-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={sx} y={sy} width={sw} height={sh} rx={sr} ry={sr}
                fill="black"
                style={{ transition: "all 0.4s cubic-bezier(0.4,0,0.2,1)" }}
              />
            </mask>
          </defs>
          <rect
            width="100%" height="100%"
            fill="rgba(0,0,0,0.82)"
            mask="url(#tuto-mask)"
          />
          {/* Pulsing ring around spotlight */}
          <rect
            x={sx - 3} y={sy - 3} width={sw + 6} height={sh + 6} rx={sr + 3} ry={sr + 3}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
            opacity="0.6"
            className="tuto-pulse-ring"
            style={{ transition: "all 0.4s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
      )}

      {/* Success animation */}
      {successAnim && rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top + rect.height / 2 - 24,
            left: rect.left + rect.width / 2 - 24,
            width: 48, height: 48,
            zIndex: 815,
            animation: "tutoSuccessPop 0.6s ease-out forwards",
          }}
        >
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7"/>
            </svg>
          </div>
        </div>
      )}

      {/* Confetti on final step */}
      {isFinal && (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 820 }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="tuto-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
                background: ["#7C6BF0", "#9B8BFF", "#5ED4C8", "#F5C563", "#F06B7E", "#FF9F43"][i % 6],
                width: `${6 + Math.random() * 6}px`,
                height: `${6 + Math.random() * 6}px`,
              }}
            />
          ))}
        </div>
      )}

      {/* Tooltip */}
      <div
        key={tooltipKey}
        style={tooltipStyle}
        className="tuto-tooltip-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arrow */}
        {arrowStyle && <div style={arrowStyle} />}

        <div
          style={{
            background: "rgba(30,30,45,0.95)",
            border: "1px solid rgba(124,107,240,0.2)",
            borderLeft: "4px solid transparent",
            borderImage: "linear-gradient(180deg, #7C6BF0, #9B8BFF) 1",
            borderImageSlice: "0 0 0 1",
            backdropFilter: "blur(24px)",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <div className="p-4">
            {/* Section pill + quit */}
            <div className="flex items-center justify-between mb-3">
              <button
                className="text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors"
                style={{
                  background: "rgba(124,107,240,0.15)",
                  color: "var(--accent)",
                  border: "1px solid rgba(124,107,240,0.3)",
                }}
                onClick={() => setSectionPickerOpen(!sectionPickerOpen)}
              >
                <span>{section?.emoji}</span>
                <span>{section?.label}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ transform: sectionPickerOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  <path d="M2 4l3 3 3-3"/>
                </svg>
              </button>
              <button
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }}
                onClick={onStop}
              >
                Quitter
              </button>
            </div>

            {/* Section picker dropdown */}
            {sectionPickerOpen && (
              <div
                className="mb-3 flex gap-1.5 overflow-x-auto pb-1"
                style={{ scrollbarWidth: "none" }}
              >
                {TUTORIAL_SECTIONS.map((sec) => (
                  <button
                    key={sec.id}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors"
                    style={{
                      background: sec.id === section?.id ? "var(--accent)" : "rgba(255,255,255,0.08)",
                      color: sec.id === section?.id ? "#fff" : "rgba(255,255,255,0.5)",
                    }}
                    onClick={() => {
                      setSectionPickerOpen(false);
                      onJumpToSection(sec.id);
                    }}
                  >
                    {sec.emoji} {sec.label}
                  </button>
                ))}
              </div>
            )}

            {/* Title & description */}
            <p className="font-bold text-[15px] mb-1.5" style={{ fontFamily: "var(--font-title)", color: "#fff" }}>
              {currentStep.title}
            </p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "rgba(255,255,255,0.55)" }}>
              {currentStep.description}
            </p>

            {/* Interaction hint */}
            {isInteractive && !interactionDone && currentStep.hintText && (
              <div
                className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl tuto-hint-pulse"
                style={{ background: "rgba(124,107,240,0.1)", border: "1px solid rgba(124,107,240,0.2)" }}
              >
                {renderHintIcon()}
                <span className="text-[11px] font-bold" style={{ color: "var(--accent)" }}>
                  {currentStep.hintText}
                </span>
              </div>
            )}

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1 mb-3">
              {dots.map((d, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: d.current ? 16 : 6,
                    height: 6,
                    background: d.current
                      ? "var(--accent)"
                      : d.done
                      ? "rgba(124,107,240,0.5)"
                      : "rgba(255,255,255,0.12)",
                  }}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              <button
                className="text-[11px] font-bold px-3 py-2 rounded-xl"
                style={{ color: "rgba(255,255,255,0.4)" }}
                onClick={onSkipSection}
              >
                Passer la section
              </button>
              <div className="flex-1" />
              {isInteractive && !interactionDone ? (
                <>
                  <button
                    className="text-[11px] font-bold px-5 py-2.5 rounded-xl transition-all"
                    style={{
                      background: "rgba(124,107,240,0.3)",
                      color: "rgba(255,255,255,0.4)",
                      cursor: showFallback ? "pointer" : "default",
                      opacity: showFallback ? 1 : 0.5,
                    }}
                    onClick={showFallback ? onNext : undefined}
                    disabled={!showFallback}
                  >
                    {showFallback ? "Passer" : "Essaie !"}
                  </button>
                </>
              ) : (
                <button
                  className="text-[11px] font-bold px-5 py-2.5 rounded-xl"
                  style={{ background: "var(--accent)", color: "#fff" }}
                  onClick={isFinal ? onStop : onNext}
                >
                  {isFinal ? "C'est parti !" : "Suivant"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes tutoSlideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes tutoSlideUpCenter {
          from { opacity: 0; transform: translate(-50%, -46%); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }
        .tuto-tooltip-enter {
          animation: ${isFullscreen || !rect ? "tutoSlideUpCenter" : "tutoSlideUp"} 0.35s ease-out;
        }
        @keyframes confettiFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        .tuto-confetti {
          position: absolute;
          top: -10px;
          border-radius: 2px;
          animation: confettiFall linear forwards;
        }
        @keyframes tutoPulseRing {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .tuto-pulse-ring {
          animation: tutoPulseRing 2s ease-in-out infinite;
        }
        @keyframes tutoHintPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        .tuto-hint-pulse {
          animation: tutoHintPulse 1.5s ease-in-out infinite;
        }
        @keyframes tutoSuccessPop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes tutoFadeInOut {
          0% { opacity: 0; }
          40% { opacity: 1; }
          60% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}
