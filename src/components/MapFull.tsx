"use client";

import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

interface MapMarker {
  lat: number;
  lng: number;
  emoji: string;
  name: string;
  color?: string;
  type: "member" | "address";
}

interface MapFullProps {
  markers: MapMarker[];
  center?: [number, number];
  onClose: () => void;
}

export default function MapFull({ markers, center, onClose }: MapFullProps) {
  return (
    <div className="fixed inset-0" style={{ zIndex: 1000, background: "var(--bg)" }}>
      <div className="absolute top-4 left-4 flex items-center gap-2" style={{ zIndex: 1001 }}>
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(255,107,107,0.2)", color: "var(--red)" }}>
          🔴 En direct
        </span>
      </div>

      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-sm font-bold"
        style={{ zIndex: 1001, background: "var(--surface2)" }}
      >
        ✕
      </button>

      <div className="absolute top-14 left-0 right-0 flex gap-2 px-4 overflow-x-auto" style={{ zIndex: 1001 }}>
        {markers.map((m, i) => (
          <span key={i} className="flex-shrink-0 px-2 py-1 rounded-full text-xs font-bold" style={{ background: "var(--surface)" }}>
            {m.emoji} {m.name}
          </span>
        ))}
      </div>

      <MapView markers={markers} center={center} interactive height="100dvh" />
    </div>
  );
}
