"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [touchStart, setTouchStart] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  const totalSlides = 3;

  useEffect(() => {
    if (step === 2) {
      const t = setTimeout(() => setShowConfetti(true), 400);
      return () => clearTimeout(t);
    }
    setShowConfetti(false);
  }, [step]);

  const goTo = useCallback((newStep: number) => {
    if (newStep < 0 || newStep >= totalSlides) return;
    setAnimKey((k) => k + 1);
    setStep(newStep);
  }, []);

  function finish(launchTutorial: boolean) {
    localStorage.setItem("flowtime_onboarded", "true");
    if (launchTutorial) {
      localStorage.setItem("flowtime_tutorial_pending", "true");
    }
    router.push("/home");
  }

  // Background gradient hue shifts between slides
  const bgGradients = [
    "radial-gradient(ellipse at 30% 40%, rgba(124,107,240,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 80%, rgba(94,212,200,0.08) 0%, transparent 50%)",
    "radial-gradient(ellipse at 60% 30%, rgba(94,212,200,0.15) 0%, transparent 60%), radial-gradient(ellipse at 30% 70%, rgba(245,197,99,0.08) 0%, transparent 50%)",
    "radial-gradient(ellipse at 50% 50%, rgba(124,107,240,0.12) 0%, transparent 50%), radial-gradient(ellipse at 70% 30%, rgba(240,107,126,0.08) 0%, transparent 50%)",
  ];

  return (
    <div
      className="h-dvh flex flex-col relative overflow-hidden"
      style={{ background: "var(--bg)" }}
      onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const diff = e.changedTouches[0].clientX - touchStart;
        if (diff > 60 && step > 0) goTo(step - 1);
        if (diff < -60 && step < totalSlides - 1) goTo(step + 1);
      }}
    >
      {/* Animated background gradient */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ background: bgGradients[step] }}
      />

      {/* Skip button */}
      <div className="relative flex justify-end px-6 shrink-0" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
        <button
          className="text-[11px] font-medium px-3 py-1"
          style={{ color: "var(--dim)" }}
          onClick={() => finish(false)}
        >
          Passer
        </button>
      </div>

      {/* Content area */}
      <div
        key={animKey}
        className="flex-1 flex flex-col items-center justify-center text-center px-8 relative onb-crossfade"
        style={{ minHeight: 0 }}
      >
        {step === 0 && <Slide1 />}
        {step === 1 && <Slide2 />}
        {step === 2 && <Slide3 showConfetti={showConfetti} />}
      </div>

      {/* Dots */}
      <div className="relative flex justify-center gap-2.5 mb-4 shrink-0">
        {Array.from({ length: totalSlides }).map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className="rounded-full transition-all duration-400"
            style={{
              width: i === step ? 24 : 8,
              height: 8,
              background: i === step
                ? "linear-gradient(90deg, var(--accent), #9B8BFF)"
                : "rgba(255,255,255,0.12)",
            }}
          />
        ))}
      </div>

      {/* Buttons */}
      <div className="relative px-6 shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
        {step < 2 ? (
          <button
            className="w-full py-3.5 rounded-2xl text-sm font-bold"
            style={{ background: "linear-gradient(135deg, var(--accent), #9B8BFF)", color: "#fff" }}
            onClick={() => goTo(step + 1)}
          >
            Suivant
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              className="w-full py-3.5 rounded-2xl text-sm font-bold"
              style={{ background: "linear-gradient(135deg, var(--accent), #9B8BFF)", color: "#fff" }}
              onClick={() => finish(true)}
            >
              Découvrir FlowTime
            </button>
            <button
              className="w-full py-3 rounded-2xl text-xs font-bold"
              style={{ background: "var(--surface2)", color: "var(--dim)" }}
              onClick={() => finish(false)}
            >
              Je connais déjà
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes onbCrossfade {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        .onb-crossfade {
          animation: onbCrossfade 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}

/* ---- Slide 1: Logo with rotating gradient ring ---- */
function Slide1() {
  return (
    <>
      <div className="relative w-[140px] h-[140px] flex items-center justify-center mb-8">
        {/* Rotating ring */}
        <div className="absolute inset-0 rounded-full onb-ring-spin" style={{
          background: "conic-gradient(from 0deg, #7C6BF0, #9B8BFF, #5ED4C8, #F5C563, #7C6BF0)",
          padding: 3,
          WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
          mask: "radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px))",
        }} />
        {/* Inner circle */}
        <div className="w-[122px] h-[122px] rounded-full flex items-center justify-center"
          style={{ background: "rgba(124,107,240,0.1)" }}>
          <div className="onb-logo-pop">
            <Logo size={70} />
          </div>
        </div>
      </div>
      <h2 className="text-2xl font-bold mb-3 onb-title-up" style={{ fontFamily: "var(--font-title)", color: "var(--text)" }}>
        Bienvenue sur FlowTime
      </h2>
      <p className="text-sm max-w-[280px] onb-desc-up" style={{ color: "var(--dim)" }}>
        L&apos;app qui met toute ta famille en harmonie
      </p>

      <style jsx>{`
        @keyframes onbRingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .onb-ring-spin {
          animation: onbRingSpin 4s linear infinite;
        }
        @keyframes onbLogoPop {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .onb-logo-pop { animation: onbLogoPop 0.6s ease-out; }
        @keyframes onbTitleUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .onb-title-up { animation: onbTitleUp 0.5s ease-out 0.2s both; }
        .onb-desc-up { animation: onbTitleUp 0.5s ease-out 0.35s both; }
      `}</style>
    </>
  );
}

/* ---- Slide 2: 3 mini glass cards ---- */
function Slide2() {
  const cards = [
    { icon: "\u{1F4C5}", label: "Planning", color: "rgba(124,107,240,0.15)" },
    { icon: "\u{1F5FA}\uFE0F", label: "Famille", color: "rgba(94,212,200,0.15)" },
    { icon: "\u{1F30A}", label: "Flow AI", color: "rgba(245,197,99,0.15)" },
  ];

  return (
    <>
      <div className="flex gap-3 mb-8">
        {cards.map((card, i) => (
          <div
            key={card.label}
            className="onb-card-stagger flex flex-col items-center gap-2 px-5 py-4 rounded-2xl"
            style={{
              background: "var(--surface2)",
              border: "1px solid var(--glass-border)",
              backdropFilter: "blur(12px)",
              animationDelay: `${i * 0.15}s`,
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ background: card.color }}
            >
              {card.icon}
            </div>
            <span className="text-[11px] font-bold" style={{ color: "var(--dim)" }}>
              {card.label}
            </span>
          </div>
        ))}
      </div>
      <h2 className="text-2xl font-bold mb-3 onb-title-up" style={{ fontFamily: "var(--font-title)", color: "var(--text)" }}>
        Tout au même endroit
      </h2>
      <p className="text-sm max-w-[280px] onb-desc-up" style={{ color: "var(--dim)" }}>
        Planning, famille, organisation — simplifie ton quotidien
      </p>

      <style jsx>{`
        @keyframes onbCardStagger {
          from { opacity: 0; transform: translateY(20px) scale(0.9); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .onb-card-stagger { animation: onbCardStagger 0.5s ease-out both; }
        @keyframes onbTitleUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .onb-title-up { animation: onbTitleUp 0.5s ease-out 0.5s both; }
        .onb-desc-up { animation: onbTitleUp 0.5s ease-out 0.65s both; }
      `}</style>
    </>
  );
}

/* ---- Slide 3: Checkmark + confetti ---- */
function Slide3({ showConfetti }: { showConfetti: boolean }) {
  return (
    <>
      <div className="relative w-[100px] h-[100px] flex items-center justify-center mb-8">
        {/* Animated checkmark circle */}
        <div
          className="w-[100px] h-[100px] rounded-full flex items-center justify-center onb-check-pop"
          style={{ background: "rgba(34,197,94,0.15)" }}
        >
          <svg
            width="48" height="48" viewBox="0 0 56 56"
            className="onb-check-draw"
          >
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(34,197,94,0.3)" strokeWidth="2" />
            <path
              d="M16 28l8 8 16-16"
              fill="none"
              stroke="#22c55e"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="40"
              strokeDashoffset="40"
              className="onb-check-path"
            />
          </svg>
        </div>

        {/* Mini confetti burst */}
        {showConfetti && (
          <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className="onb-mini-confetti"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: `${4 + Math.random() * 4}px`,
                  height: `${4 + Math.random() * 4}px`,
                  borderRadius: "1px",
                  background: ["#7C6BF0", "#9B8BFF", "#5ED4C8", "#F5C563", "#F06B7E", "#22c55e"][i % 6],
                  animationDelay: `${Math.random() * 0.3}s`,
                  animationDuration: `${0.6 + Math.random() * 0.6}s`,
                  // Random direction via CSS custom properties
                  ["--dx" as string]: `${(Math.random() - 0.5) * 120}px`,
                  ["--dy" as string]: `${-30 - Math.random() * 80}px`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <h2 className="text-2xl font-bold mb-3 onb-title-up" style={{ fontFamily: "var(--font-title)", color: "var(--text)" }}>
        Prêt à commencer ?
      </h2>
      <p className="text-sm max-w-[280px] onb-desc-up" style={{ color: "var(--dim)" }}>
        On te fait un petit tour guidé
      </p>

      <style jsx>{`
        @keyframes onbCheckPop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); }
          100% { transform: scale(1); opacity: 1; }
        }
        .onb-check-pop { animation: onbCheckPop 0.5s ease-out; }
        @keyframes onbCheckDraw {
          to { stroke-dashoffset: 0; }
        }
        .onb-check-path { animation: onbCheckDraw 0.5s ease-out 0.3s forwards; }
        @keyframes onbMiniConfetti {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; }
        }
        .onb-mini-confetti { animation: onbMiniConfetti ease-out forwards; }
        @keyframes onbTitleUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .onb-title-up { animation: onbTitleUp 0.5s ease-out 0.3s both; }
        .onb-desc-up { animation: onbTitleUp 0.5s ease-out 0.45s both; }
      `}</style>
    </>
  );
}
