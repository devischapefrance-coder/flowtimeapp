"use client";

import { useState, useEffect, useRef } from "react";

interface TimerProps {
  duration: number; // in seconds
  color?: string;
  onComplete: () => void;
  countUp?: boolean;
}

export default function Timer({ duration, color = "var(--accent)", onComplete, countUp = false }: TimerProps) {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (!countUp && next >= duration) {
            clearInterval(intervalRef.current!);
            onComplete();
            return duration;
          }
          return next;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, duration, countUp, onComplete]);

  const remaining = countUp ? elapsed : duration - elapsed;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = countUp ? 1 : elapsed / duration;

  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  function stop() {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    onComplete();
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--surface2)" strokeWidth="6" />
          <circle
            cx="100" cy="100" r={radius}
            fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-3xl font-extrabold">
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          className="btn btn-secondary !w-auto !px-6"
          onClick={() => setRunning(!running)}
        >
          {running ? "⏸️ Pause" : "▶️ Reprendre"}
        </button>
        <button className="btn btn-danger !w-auto !px-6" onClick={stop}>
          ⏹️ Arrêter
        </button>
      </div>
    </div>
  );
}
