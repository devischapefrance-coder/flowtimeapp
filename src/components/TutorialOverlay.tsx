"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { TUTORIAL_STEPS, TUTORIAL_SECTIONS, getSectionForStep } from "@/lib/tutorial-data";
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

type Phase = "visible" | "fadeOut" | "scrolling" | "fadeIn";

export default function TutorialOverlay({
  active, step, onNext, onPrev, onStop, onSkipSection, onJumpToSection,
}: TutorialOverlayProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [sectionPickerOpen, setSectionPickerOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("visible");
  const [transitioning, setTransitioning] = useState(false);

  // Spotlight rect — animated via CSS transition, updated here
  const [spotRect, setSpotRect] = useState<DOMRect | null>(null);
  // Displayed step content (delayed so tooltip content changes during fade)
  const [displayStep, setDisplayStep] = useState(step);

  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStepRef = useRef(step);
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const currentStep = TUTORIAL_STEPS[displayStep] as TutorialStep | undefined;
  const targetStep = TUTORIAL_STEPS[step] as TutorialStep | undefined;
  const isFullscreen = !currentStep?.targetAttr;
  const isFinal = currentStep?.id === "done";
  const section = getSectionForStep(displayStep);

  // ---- Scroll lock: simple overflow hidden on the scroll container ----
  useEffect(() => {
    if (!active) return;

    scrollContainerRef.current = document.querySelector("[class*='pb-\\[80px\\]']") as HTMLElement | null;

    // Save scroll position and lock body with position:fixed to prevent iOS Safari bounce
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    // Block touch scrolling
    const preventScroll = (e: TouchEvent) => {
      const tooltip = document.getElementById("tuto-tooltip");
      if (tooltip && tooltip.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener("touchmove", preventScroll, { passive: false });

    // Disable navbar + hide the white gap below it on iOS
    const navbar = document.querySelector("nav") as HTMLElement | null;
    if (navbar) {
      navbar.style.pointerEvents = "none";
      navbar.style.paddingBottom = `calc(10px + env(safe-area-inset-bottom, 0px))`;
    }

    // Black fill below everything to prevent white flash on iOS
    const fill = document.createElement("div");
    fill.id = "tuto-ios-fill";
    fill.style.cssText = "position:fixed;inset:0;background:#000;z-index:799;pointer-events:none";
    document.body.appendChild(fill);

    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      window.scrollTo(0, scrollY);
      document.removeEventListener("touchmove", preventScroll);
      if (navbar) {
        navbar.style.pointerEvents = "";
        navbar.style.paddingBottom = "";
      }
      const f = document.getElementById("tuto-ios-fill");
      if (f) f.remove();
    };
  }, [active]);

  // ---- Scroll to element without visual jump ----
  const scrollToAndMeasure = useCallback((el: HTMLElement): Promise<DOMRect> => {
    return new Promise((resolve) => {
      // Temporarily allow scroll
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";

      el.scrollIntoView({ behavior: "smooth", block: "center" });

      // Wait for scroll to finish then measure and re-lock
      setTimeout(() => {
        const rect = el.getBoundingClientRect();
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        resolve(rect);
      }, 350);
    });
  }, []);

  // ---- Find target and measure ----
  const findAndMeasure = useCallback(async (targetAttr: string | null): Promise<DOMRect | null> => {
    if (!targetAttr) return null;

    let attempts = 0;
    const maxAttempts = 12;

    return new Promise((resolve) => {
      function tryFind() {
        const el = document.querySelector(`[data-tutorial="${targetAttr}"]`) as HTMLElement | null;
        if (el) {
          scrollToAndMeasure(el).then(resolve);
        } else if (attempts < maxAttempts) {
          attempts++;
          retryRef.current = setTimeout(tryFind, 250);
        } else {
          resolve(null);
        }
      }
      tryFind();
    });
  }, [scrollToAndMeasure]);

  // ---- Orchestrate step transitions ----
  useEffect(() => {
    if (!active || !targetStep) return;
    if (prevStepRef.current === step && phase === "visible" && displayStep === step) return;

    const prevStep = TUTORIAL_STEPS[prevStepRef.current];
    const isPageChange = prevStep && prevStep.page !== targetStep.page;

    // Clear any pending timers
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    if (retryRef.current) clearTimeout(retryRef.current);

    // If this is the initial render (component just became active)
    if (prevStepRef.current === step && displayStep !== step) {
      setDisplayStep(step);
      prevStepRef.current = step;
      if (targetStep.targetAttr) {
        findAndMeasure(targetStep.targetAttr).then((rect) => {
          setSpotRect(rect);
          setPhase("fadeIn");
          phaseTimerRef.current = setTimeout(() => setPhase("visible"), 400);
        });
      } else {
        setSpotRect(null);
        setPhase("fadeIn");
        phaseTimerRef.current = setTimeout(() => setPhase("visible"), 400);
      }
      return;
    }

    prevStepRef.current = step;

    if (isPageChange) {
      // ---- Cross-page transition ----
      // 1. Fade everything out
      setPhase("fadeOut");
      setTransitioning(true);

      phaseTimerRef.current = setTimeout(() => {
        // 2. Navigate
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
        router.push(targetStep.page);

        // 3. Wait for page, then find element and fade in
        setTimeout(() => {
          setDisplayStep(step);
          setSectionPickerOpen(false);

          if (targetStep.targetAttr) {
            findAndMeasure(targetStep.targetAttr).then((rect) => {
              setSpotRect(rect);
              setTransitioning(false);
              setPhase("fadeIn");
              phaseTimerRef.current = setTimeout(() => setPhase("visible"), 400);
            });
          } else {
            setSpotRect(null);
            setTransitioning(false);
            setPhase("fadeIn");
            phaseTimerRef.current = setTimeout(() => setPhase("visible"), 400);
          }
        }, 600);
      }, 300);
    } else {
      // ---- Same-page transition ----
      // 1. Fade out tooltip
      setPhase("fadeOut");

      phaseTimerRef.current = setTimeout(() => {
        // 2. Update content + move spotlight
        setDisplayStep(step);
        setSectionPickerOpen(false);

        if (targetStep.targetAttr) {
          setPhase("scrolling");
          findAndMeasure(targetStep.targetAttr).then((rect) => {
            setSpotRect(rect);
            // 3. Wait for spotlight transition, then fade in
            phaseTimerRef.current = setTimeout(() => {
              setPhase("fadeIn");
              phaseTimerRef.current = setTimeout(() => setPhase("visible"), 400);
            }, 300);
          });
        } else {
          setSpotRect(null);
          setPhase("fadeIn");
          phaseTimerRef.current = setTimeout(() => setPhase("visible"), 400);
        }
      }, 250);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  // Initial load
  useEffect(() => {
    if (!active || !targetStep) return;
    if (displayStep === step) return;

    setDisplayStep(step);
    if (targetStep.targetAttr) {
      findAndMeasure(targetStep.targetAttr).then((rect) => {
        setSpotRect(rect);
        setPhase("fadeIn");
        phaseTimerRef.current = setTimeout(() => setPhase("visible"), 400);
      });
    } else {
      setSpotRect(null);
      setPhase("fadeIn");
      phaseTimerRef.current = setTimeout(() => setPhase("visible"), 400);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, []);

  if (!active || !currentStep || !mounted) return null;

  const padding = 12;

  // Progress dots
  const sectionDots = TUTORIAL_SECTIONS.map((sec) => {
    const steps = TUTORIAL_STEPS.filter((s) => s.section === sec.id);
    const firstIdx = TUTORIAL_STEPS.indexOf(steps[0]);
    return {
      section: sec,
      steps: steps.map((_, i) => ({
        idx: firstIdx + i,
        done: firstIdx + i < displayStep,
        current: firstIdx + i === displayStep,
      })),
    };
  });

  // Spotlight values
  const hasSpot = !!spotRect && !isFullscreen;
  const sx = spotRect ? spotRect.left - padding : 0;
  const sy = spotRect ? spotRect.top - padding : 0;
  const sw = spotRect ? spotRect.width + padding * 2 : 0;
  const sh = spotRect ? spotRect.height + padding * 2 : 0;
  const sr = 16;

  // Tooltip position
  const tooltipStyle: React.CSSProperties = {
    position: "fixed",
    width: 340,
    maxWidth: "calc(100vw - 24px)",
    zIndex: 810,
    left: "50%",
  };

  if (!hasSpot) {
    tooltipStyle.top = "50%";
    tooltipStyle.transform = "translate(-50%, -50%)";
  } else if (currentStep.position === "bottom") {
    tooltipStyle.top = Math.min(spotRect!.bottom + padding + 16, window.innerHeight - 280);
    tooltipStyle.transform = "translateX(-50%)";
  } else {
    tooltipStyle.bottom = `calc(100vh - ${spotRect!.top - padding - 16}px)`;
    tooltipStyle.transform = "translateX(-50%)";
  }

  // Tooltip opacity based on phase
  const tooltipOpacity = phase === "fadeOut" || phase === "scrolling" ? 0 : 1;
  const tooltipTranslateY = phase === "fadeOut" ? 12 : phase === "fadeIn" ? 0 : 0;

  // Arrow
  const showArrow = hasSpot;
  const arrowIsTop = currentStep.position === "bottom";

  // Section info
  const sectionSteps = TUTORIAL_STEPS.filter((s) => s.section === currentStep.section);
  const stepInSection = sectionSteps.indexOf(currentStep) + 1;
  const totalInSection = sectionSteps.length;

  const overlay = (
    <div style={{ position: "fixed", inset: 0, zIndex: 800 }}>
      {/* Cross-page black overlay */}
      <div
        style={{
          position: "fixed", inset: 0, background: "#000", zIndex: 850,
          opacity: transitioning ? 1 : 0,
          transition: "opacity 0.3s ease",
          pointerEvents: transitioning ? "auto" : "none",
        }}
      />

      {/* Dark overlay with spotlight cutout */}
      {!hasSpot ? (
        <div style={{
          position: "fixed", inset: 0, zIndex: 800,
          background: "rgba(0,0,0,0.82)",
          opacity: phase === "fadeOut" && transitioning ? 0 : 1,
          transition: "opacity 0.3s ease",
        }} />
      ) : (
        <>
          <svg style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 800, pointerEvents: "none" }}>
            <defs>
              <mask id="tuto-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={sx} y={sy} width={sw} height={sh} rx={sr} ry={sr}
                  fill="black"
                  style={{ transition: "all 0.5s cubic-bezier(0.4,0,0.2,1)" }}
                />
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.82)" mask="url(#tuto-mask)" />
            {/* Glowing ring */}
            <rect
              x={sx - 2} y={sy - 2} width={sw + 4} height={sh + 4} rx={sr + 2} ry={sr + 2}
              fill="none" stroke="var(--accent)" strokeWidth="1.5"
              className="tuto-glow-ring"
              style={{ transition: "all 0.5s cubic-bezier(0.4,0,0.2,1)" }}
            />
          </svg>

          {/* Block outside clicks */}
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: Math.max(0, sy), zIndex: 801 }} />
          <div style={{ position: "fixed", top: sy + sh, left: 0, right: 0, bottom: 0, zIndex: 801 }} />
          <div style={{ position: "fixed", top: sy, left: 0, width: Math.max(0, sx), height: sh, zIndex: 801 }} />
          <div style={{ position: "fixed", top: sy, left: sx + sw, right: 0, height: sh, zIndex: 801 }} />
        </>
      )}

      {/* Confetti */}
      {isFinal && phase === "visible" && (
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
        id="tuto-tooltip"
        style={{
          ...tooltipStyle,
          opacity: tooltipOpacity,
          transition: "opacity 0.25s ease, transform 0.25s ease",
          ...(phase === "fadeIn" ? { animation: "tutoSlideIn 0.35s ease-out" } : {}),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Arrow */}
        {showArrow && (
          <div style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "8px solid transparent", borderRight: "8px solid transparent",
            ...(arrowIsTop
              ? { top: -8, borderBottom: "8px solid rgba(30,30,45,0.95)" }
              : { bottom: -8, borderTop: "8px solid rgba(30,30,45,0.95)" }),
          }} />
        )}

        <div style={{
          background: "rgba(30,30,45,0.95)",
          border: "1px solid rgba(124,107,240,0.2)",
          borderLeft: "4px solid transparent",
          borderImage: "linear-gradient(180deg, #7C6BF0, #9B8BFF) 1",
          borderImageSlice: "0 0 0 1",
          backdropFilter: "blur(24px)",
          borderRadius: 16,
          overflow: "hidden",
        }}>
          <div className="p-4">
            {/* Section pill + quit */}
            <div className="flex items-center justify-between mb-3">
              <button
                className="text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5"
                style={{
                  background: "rgba(124,107,240,0.15)",
                  color: "var(--accent)",
                  border: "1px solid rgba(124,107,240,0.3)",
                }}
                onClick={() => setSectionPickerOpen(!sectionPickerOpen)}
              >
                <span>{section?.emoji}</span>
                <span>{section?.label}</span>
                <span style={{ opacity: 0.5, fontSize: 10 }}>{stepInSection}/{totalInSection}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ transform: sectionPickerOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                  <path d="M2 4l3 3 3-3"/>
                </svg>
              </button>
              <button
                className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }}
                onClick={onStop}
              >
                Quitter
              </button>
            </div>

            {/* Section picker */}
            {sectionPickerOpen && (
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {TUTORIAL_SECTIONS.map((sec) => (
                  <button
                    key={sec.id}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                    style={{
                      background: sec.id === section?.id ? "var(--accent)" : "rgba(255,255,255,0.08)",
                      color: sec.id === section?.id ? "#fff" : "rgba(255,255,255,0.5)",
                    }}
                    onClick={() => { setSectionPickerOpen(false); onJumpToSection(sec.id); }}
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

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 mb-4">
              {sectionDots.map((sd) => (
                <div key={sd.section.id} className="flex items-center gap-0.5">
                  {sd.steps.map((s) => (
                    <div
                      key={s.idx}
                      className="rounded-full"
                      style={{
                        width: s.current ? 16 : 6,
                        height: 6,
                        transition: "all 0.4s ease",
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
                className="text-[11px] font-bold px-3 py-2 rounded-xl active:scale-95 transition-transform"
                style={{ color: "rgba(255,255,255,0.35)" }}
                onClick={onSkipSection}
              >
                Passer la section
              </button>
              <div className="flex-1" />
              <button
                className="text-[11px] font-bold px-5 py-2.5 rounded-xl active:scale-95 transition-transform"
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
        @keyframes tutoSlideIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
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
        @keyframes tutoGlow {
          0%, 100% { opacity: 0.3; filter: drop-shadow(0 0 4px var(--accent)); }
          50% { opacity: 0.7; filter: drop-shadow(0 0 8px var(--accent)); }
        }
        .tuto-glow-ring {
          animation: tutoGlow 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}
