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
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const currentStep = TUTORIAL_STEPS[step] as TutorialStep | undefined;
  const isFullscreen = !currentStep?.targetAttr;
  const total = TUTORIAL_STEPS.length;
  const isFinal = currentStep?.id === "done";
  const section = getSectionForStep(step);

  // Lock body scroll when tutorial is active
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";

    // Disable navbar clicks
    const navbar = document.querySelector("nav") as HTMLElement | null;
    if (navbar) navbar.style.pointerEvents = "none";

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      window.scrollTo(0, scrollY);
      if (navbar) navbar.style.pointerEvents = "";
    };
  }, [active]);

  // Reset state on step change
  useEffect(() => {
    setSectionPickerOpen(false);
    setTooltipKey((k) => k + 1);
  }, [step]);

  // Unlock scroll temporarily to scroll element into view, then relock
  const scrollToElement = useCallback((el: HTMLElement) => {
    // Temporarily unlock scroll
    const savedTop = document.body.style.top;
    const scrollY = savedTop ? -parseInt(savedTop, 10) : 0;
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.top = "";
    window.scrollTo(0, scrollY);

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    setTimeout(() => {
      const newScrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${newScrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      setRect(el.getBoundingClientRect());
    }, 400);
  }, []);

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
        scrollToElement(el);
      } else if (attempts < maxAttempts) {
        attempts++;
        retryRef.current = setTimeout(tryFind, 300);
      } else {
        setRect(null);
      }
    }

    tryFind();
  }, [active, currentStep, scrollToElement]);

  // Navigate cross-page if needed
  useEffect(() => {
    if (!active || !currentStep) return;

    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }

    if (pathname !== currentStep.page) {
      setTransitioning(true);
      // Unlock scroll before navigating
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      router.push(currentStep.page);
      setTimeout(() => {
        setTransitioning(false);
        // Re-lock after navigation
        const scrollY = window.scrollY;
        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = "0";
        document.body.style.right = "0";
        findTarget();
      }, 700);
    } else {
      findTarget();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, pathname]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  if (!active || !currentStep || !mounted) return null;

  const padding = 12;

  // Progress dots grouped by section
  const sectionDots = TUTORIAL_SECTIONS.map((sec) => {
    const sectionSteps = TUTORIAL_STEPS.filter((s) => s.section === sec.id);
    const firstIdx = TUTORIAL_STEPS.indexOf(sectionSteps[0]);
    return {
      section: sec,
      steps: sectionSteps.map((s, i) => ({
        globalIndex: firstIdx + i,
        done: firstIdx + i < step,
        current: firstIdx + i === step,
      })),
    };
  });

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
    tooltipStyle.top = Math.min(rect.bottom + padding + 16, window.innerHeight - 280);
  } else {
    const topY = rect.top - padding - 16;
    tooltipStyle.bottom = `calc(100vh - ${topY}px)`;
  }

  // Arrow
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

  // Step number within current section
  const sectionSteps = TUTORIAL_STEPS.filter((s) => s.section === currentStep.section);
  const stepInSection = sectionSteps.indexOf(currentStep) + 1;
  const totalInSection = sectionSteps.length;

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

      {/* Overlay: 4 dark rects around the spotlight to block clicks outside but allow inside */}
      {isFullscreen || !rect ? (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 800 }}
        />
      ) : (
        <>
          {/* SVG mask for visual darkening — pointer-events: none so it doesn't block */}
          <svg
            style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 800, pointerEvents: "none" }}
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
            {/* Pulsing ring */}
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

          {/* 4 clickable dark rects around the spotlight to block outside clicks */}
          {/* Top */}
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: Math.max(0, sy), zIndex: 801 }} />
          {/* Bottom */}
          <div style={{ position: "fixed", top: sy + sh, left: 0, right: 0, bottom: 0, zIndex: 801 }} />
          {/* Left */}
          <div style={{ position: "fixed", top: sy, left: 0, width: Math.max(0, sx), height: sh, zIndex: 801 }} />
          {/* Right */}
          <div style={{ position: "fixed", top: sy, left: sx + sw, right: 0, height: sh, zIndex: 801 }} />
        </>
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
            {/* Section pill + step counter + quit */}
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
                <span style={{ opacity: 0.5 }}>{stepInSection}/{totalInSection}</span>
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
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
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
            <p className="text-xs leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>
              {currentStep.description}
            </p>

            {/* Section progress dots */}
            <div className="flex items-center justify-center gap-2 mb-4">
              {sectionDots.map((sd) => (
                <div key={sd.section.id} className="flex items-center gap-0.5">
                  {sd.steps.map((s) => (
                    <div
                      key={s.globalIndex}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: s.current ? 16 : 6,
                        height: 6,
                        background: s.current
                          ? "var(--accent)"
                          : s.done
                          ? "rgba(124,107,240,0.6)"
                          : "rgba(255,255,255,0.12)",
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              <button
                className="text-[11px] font-bold px-3 py-2 rounded-xl"
                style={{ color: "rgba(255,255,255,0.35)" }}
                onClick={onSkipSection}
              >
                Passer la section
              </button>
              <div className="flex-1" />
              <button
                className="text-[11px] font-bold px-5 py-2.5 rounded-xl"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={isFinal ? onStop : onNext}
              >
                {isFinal ? "C'est parti !" : "Suivant"}
              </button>
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
