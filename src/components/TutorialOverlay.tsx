"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";

interface TutorialStep {
  id: string;
  page: string;
  targetAttr: string | null;
  title: string;
  description: string;
  position: "top" | "bottom" | "center";
}

const STEPS: TutorialStep[] = [
  {
    id: "welcome",
    page: "/home",
    targetAttr: null,
    title: "Bienvenue dans le tutoriel",
    description: "On va te faire découvrir les fonctionnalités principales de FlowTime en quelques étapes. C'est parti !",
    position: "center",
  },
  {
    id: "day-carousel",
    page: "/home",
    targetAttr: "day-carousel",
    title: "Carrousel de dates",
    description: "Navigue entre les jours en glissant horizontalement. Chaque point indique un évènement prévu ce jour-là.",
    position: "bottom",
  },
  {
    id: "add-event",
    page: "/home",
    targetAttr: "add-event-btn",
    title: "Créer un évènement",
    description: "Appuie sur ce bouton pour ajouter rapidement un évènement au planning familial.",
    position: "bottom",
  },
  {
    id: "flow-chat",
    page: "/home",
    targetAttr: "flow-chat-widget",
    title: "Flow, ton assistant IA",
    description: "Flow peut organiser ton planning, répondre à tes questions et créer des évènements par la voix.",
    position: "top",
  },
  {
    id: "famille-membres",
    page: "/famille",
    targetAttr: "famille-membres",
    title: "Les membres de ta famille",
    description: "Retrouve ici tous les membres de ta famille. Tu peux ajouter, modifier ou supprimer un membre.",
    position: "bottom",
  },
  {
    id: "famille-map",
    page: "/famille",
    targetAttr: "famille-map",
    title: "Carte interactive",
    description: "Visualise toutes les adresses de la famille sur la carte. Tu peux ouvrir la carte en plein écran.",
    position: "top",
  },
  {
    id: "vie-tabs",
    page: "/vie",
    targetAttr: "vie-tabs",
    title: "Vie de famille",
    description: "Notes, anniversaires, courses, budget, tâches et photos — tout est ici, organisé par onglets.",
    position: "bottom",
  },
  {
    id: "search",
    page: "/home",
    targetAttr: "navbar-search",
    title: "Recherche rapide",
    description: "Cherche un évènement, un contact, une note ou une adresse en un instant.",
    position: "top",
  },
  {
    id: "family-code",
    page: "/reglages",
    targetAttr: "family-code",
    title: "Code famille",
    description: "Partage ce code à tes proches pour qu'ils rejoignent ta famille sur FlowTime.",
    position: "top",
  },
  {
    id: "done",
    page: "/reglages",
    targetAttr: null,
    title: "C'est parti !",
    description: "Tu connais maintenant les bases de FlowTime. N'hésite pas à explorer chaque section. Bonne organisation !",
    position: "center",
  },
];

interface TutorialOverlayProps {
  active: boolean;
  step: number;
  onNext: () => void;
  onPrev: () => void;
  onStop: () => void;
}

export default function TutorialOverlay({ active, step, onNext, onPrev, onStop }: TutorialOverlayProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const currentStep = STEPS[step];
  const isFullscreen = !currentStep?.targetAttr;
  const total = STEPS.length;

  // Find target element with retries
  const findTarget = useCallback(() => {
    if (!active || !currentStep) return;
    if (!currentStep.targetAttr) {
      setRect(null);
      return;
    }

    let attempts = 0;
    const maxAttempts = 5;

    function tryFind() {
      const el = document.querySelector(`[data-tutorial="${currentStep.targetAttr}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          setRect(el.getBoundingClientRect());
        }, 350);
      } else if (attempts < maxAttempts) {
        attempts++;
        retryRef.current = setTimeout(tryFind, 200);
      } else {
        setRect(null);
      }
    }

    tryFind();
  }, [active, currentStep]);

  // Navigate cross-page if needed
  useEffect(() => {
    if (!active || !currentStep) return;

    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }

    if (pathname !== currentStep.page) {
      router.push(currentStep.page);
    } else {
      findTarget();
    }
  }, [active, step, pathname, currentStep, router, findTarget]);

  // Recalculate rect on scroll/resize
  useEffect(() => {
    if (!active || !currentStep?.targetAttr) return;

    function recalc() {
      const el = document.querySelector(`[data-tutorial="${currentStep.targetAttr}"]`) as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    }

    window.addEventListener("scroll", recalc, true);
    window.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("scroll", recalc, true);
      window.removeEventListener("resize", recalc);
    };
  }, [active, currentStep]);

  // Cleanup retry on unmount
  useEffect(() => {
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  if (!active || !currentStep || !mounted) return null;

  const padding = 8;

  // Tooltip position
  let tooltipStyle: React.CSSProperties = {
    position: "fixed",
    width: 320,
    maxWidth: "calc(100vw - 32px)",
    zIndex: 801,
    left: "50%",
    transform: "translateX(-50%)",
  };

  if (isFullscreen || !rect) {
    tooltipStyle.top = "50%";
    tooltipStyle.transform = "translate(-50%, -50%)";
  } else if (currentStep.position === "bottom") {
    const bottomY = rect.bottom + padding + 12;
    tooltipStyle.top = bottomY;
  } else {
    // top
    const topY = rect.top - padding - 12;
    tooltipStyle.bottom = `calc(100vh - ${topY}px)`;
  }

  const overlay = (
    <div style={{ position: "fixed", inset: 0, zIndex: 800 }}>
      {/* Dark overlay with spotlight cutout */}
      {isFullscreen || !rect ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.78)",
          }}
          onClick={onStop}
        />
      ) : (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              pointerEvents: "none",
            }}
          />
          {/* Spotlight element */}
          <div
            style={{
              position: "fixed",
              top: rect.top - padding,
              left: rect.left - padding,
              width: rect.width + padding * 2,
              height: rect.height + padding * 2,
              borderRadius: 16,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.78)",
              border: "2px solid var(--accent)",
              zIndex: 800,
              pointerEvents: "none",
              transition: "all 0.3s ease",
            }}
          />
          {/* Clickable overlay areas around spotlight */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 799 }}
            onClick={(e) => {
              // Don't close if clicking inside spotlight area
              const x = e.clientX;
              const y = e.clientY;
              if (
                x >= rect.left - padding &&
                x <= rect.left + rect.width + padding &&
                y >= rect.top - padding &&
                y <= rect.top + rect.height + padding
              ) {
                return;
              }
            }}
          />
        </>
      )}

      {/* Tooltip */}
      <div
        style={tooltipStyle}
        className="rounded-2xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-2xl p-4"
          style={{
            background: "var(--card)",
            border: "1px solid var(--glass-border)",
            backdropFilter: "blur(20px)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {step + 1}/{total}
            </span>
            <button
              className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ color: "var(--dim)", background: "var(--surface2)" }}
              onClick={onStop}
            >
              Quitter
            </button>
          </div>

          {/* Content */}
          <p className="font-bold text-sm mb-1">{currentStep.title}</p>
          <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--dim)" }}>
            {currentStep.description}
          </p>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition-all"
                style={{
                  width: i === step ? 20 : 6,
                  height: 6,
                  background: i === step ? "var(--accent)" : i < step ? "var(--accent)" : "var(--surface2)",
                  opacity: i === step ? 1 : i < step ? 0.5 : 0.3,
                }}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            {step > 0 && (
              <button
                className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                style={{ background: "var(--surface2)", color: "var(--text)" }}
                onClick={onPrev}
              >
                Précédent
              </button>
            )}
            <button
              className="flex-1 py-2.5 rounded-xl text-xs font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={step === total - 1 ? onStop : onNext}
            >
              {step === total - 1 ? "Terminer" : "Suivant"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

export { STEPS };
