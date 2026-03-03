"use client";

import { useState, useEffect } from "react";
import { ambientAudio, type AmbientType } from "@/lib/ambient-generator";

const TRACK_NAMES: Record<AmbientType, { name: string; emoji: string }> = {
  rain: { name: "Pluie", emoji: "🌧️" },
  ocean: { name: "Ocean", emoji: "🌊" },
  forest: { name: "Foret", emoji: "🌲" },
  fireplace: { name: "Feu", emoji: "🔥" },
  wind: { name: "Vent", emoji: "💨" },
  night: { name: "Nuit", emoji: "🦗" },
};

export default function AmbientPlayer() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const unsub = ambientAudio.subscribe(() => forceUpdate((n) => n + 1));
    return () => { unsub(); };
  }, []);

  if (!ambientAudio.playing) return null;

  const type = ambientAudio.currentType;
  const info = type ? TRACK_NAMES[type] : null;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 w-full flex items-center gap-3 px-4 py-2"
      style={{
        maxWidth: 430,
        bottom: "calc(58px + env(safe-area-inset-bottom))",
        background: "var(--nav-bg)",
        backdropFilter: "blur(20px)",
        borderTop: "1px solid var(--glass-border)",
        zIndex: 99,
      }}
    >
      <span className="text-lg">{info?.emoji || "🎵"}</span>
      <div className="flex-1">
        <p className="text-xs font-bold">{info?.name || "Audio"}</p>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(ambientAudio.volume * 100)}
          onChange={(e) => ambientAudio.setVolume(parseInt(e.target.value) / 100)}
          className="!w-full !p-0 !h-1 !border-0 !rounded-full"
          style={{ accentColor: "var(--accent)" }}
        />
      </div>
      <button
        className="text-xs px-2 py-1 rounded-lg"
        style={{ background: "var(--surface2)" }}
        onClick={() => ambientAudio.stop()}
      >
        ✕
      </button>
    </div>
  );
}
