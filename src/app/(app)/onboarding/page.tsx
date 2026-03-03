"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

const STEPS = [
  {
    icon: <Logo size={80} />,
    title: "Bienvenue sur FlowTime !",
    desc: "Ton assistant familial intelligent qui synchronise toute ta famille.",
    bg: "linear-gradient(135deg, rgba(124,107,240,0.15), rgba(94,212,200,0.1))",
  },
  {
    icon: <span className="text-[64px]">👨‍👩‍👧‍👦</span>,
    title: "Ajoute ta famille",
    desc: "Commence par ajouter les membres de ta famille dans l'onglet Famille.",
    bg: "linear-gradient(135deg, rgba(94,212,200,0.15), rgba(245,197,99,0.1))",
  },
  {
    icon: <span className="text-[64px]">🗺️</span>,
    title: "Tout organiser",
    desc: "Planning, carte interactive, localisation — tout est la.",
    bg: "linear-gradient(135deg, rgba(245,197,99,0.15), rgba(240,107,126,0.1))",
  },
  {
    icon: <span className="text-[64px]">🌊</span>,
    title: "Parle a Flow",
    desc: "Dis simplement 'Emma a danse mardi a 17h' et Flow s'occupe du reste.",
    bg: "linear-gradient(135deg, rgba(124,107,240,0.15), rgba(155,139,255,0.1))",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [touchStart, setTouchStart] = useState(0);

  function finish() {
    localStorage.setItem("flowtime_onboarded", "true");
    router.push("/home");
  }

  function next() {
    if (step < STEPS.length - 1) setStep(step + 1);
    else finish();
  }

  function prev() {
    if (step > 0) setStep(step - 1);
  }

  const current = STEPS[step];

  return (
    <div
      className="min-h-dvh flex flex-col px-6 py-8 animate-in"
      onTouchStart={(e) => setTouchStart(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const diff = e.changedTouches[0].clientX - touchStart;
        if (diff > 60) prev();
        if (diff < -60) next();
      }}
    >
      {/* Skip */}
      <div className="flex justify-end">
        <button
          className="text-xs font-bold px-3 py-1.5 rounded-full"
          style={{ background: "var(--surface2)", color: "var(--dim)" }}
          onClick={finish}
        >
          Passer
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div
          className="w-[140px] h-[140px] rounded-full flex items-center justify-center mb-8"
          style={{ background: current.bg }}
        >
          {current.icon}
        </div>
        <h2 className="text-xl font-bold mb-3">{current.title}</h2>
        <p className="text-sm max-w-[280px]" style={{ color: "var(--dim)" }}>
          {current.desc}
        </p>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 mb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all"
            style={{
              width: i === step ? 24 : 8,
              height: 8,
              background: i === step ? "var(--accent)" : "var(--surface2)",
            }}
          />
        ))}
      </div>

      {/* Button */}
      <button className="btn btn-primary" onClick={next}>
        {step < STEPS.length - 1 ? "Suivant" : "Commencer"}
      </button>
    </div>
  );
}
