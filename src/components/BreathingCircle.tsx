"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface BreathingProgram {
  name: string;
  phases: { label: string; duration: number }[];
}

interface BreathingCircleProps {
  program: BreathingProgram;
  totalCycles: number;
  onComplete: () => void;
}

export default function BreathingCircle({ program, totalCycles, onComplete }: BreathingCircleProps) {
  const [cycle, setCycle] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseTime, setPhaseTime] = useState(0);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const currentPhase = program.phases[phaseIndex];
  const isInhale = currentPhase.label.includes("Inspir");
  const isHold = currentPhase.label.includes("Reten");
  const scale = isInhale ? 1 + (phaseTime / currentPhase.duration) * 0.5 : isHold ? 1.5 : 1.5 - (phaseTime / currentPhase.duration) * 0.5;

  const advance = useCallback(() => {
    const nextPhase = phaseIndex + 1;
    if (nextPhase >= program.phases.length) {
      const nextCycle = cycle + 1;
      if (nextCycle >= totalCycles) {
        onComplete();
        return;
      }
      setCycle(nextCycle);
      setPhaseIndex(0);
    } else {
      setPhaseIndex(nextPhase);
    }
    setPhaseTime(0);
  }, [phaseIndex, cycle, totalCycles, program.phases.length, onComplete]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setPhaseTime((prev) => {
        if (prev + 1 >= currentPhase.duration) {
          advance();
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, currentPhase.duration, advance]);

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className="w-40 h-40 rounded-full flex items-center justify-center transition-transform duration-1000 ease-in-out"
        style={{
          background: "radial-gradient(circle, var(--teal), rgba(61,214,200,0.2))",
          transform: `scale(${scale})`,
        }}
      >
        <span className="text-base font-bold text-center px-4">{currentPhase.label}</span>
      </div>

      <p className="text-sm" style={{ color: "var(--dim)" }}>
        Cycle {cycle + 1}/{totalCycles}
      </p>

      <button className="btn btn-secondary !w-auto !px-6" onClick={() => setRunning(!running)}>
        {running ? "⏸️ Pause" : "▶️ Reprendre"}
      </button>
    </div>
  );
}
