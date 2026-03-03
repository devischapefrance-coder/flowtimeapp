"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { MapMarker } from "./MapView";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const POI_CATEGORIES = [
  { key: "pharmacy", emoji: "💊", label: "Pharmacie", query: "pharmacy" },
  { key: "restaurant", emoji: "🍽️", label: "Restaurant", query: "restaurant" },
  { key: "supermarket", emoji: "🛒", label: "Supermarché", query: "supermarket" },
  { key: "school", emoji: "🏫", label: "École", query: "school" },
  { key: "hospital", emoji: "🏥", label: "Hôpital", query: "hospital" },
  { key: "park", emoji: "🌳", label: "Parc", query: "park" },
  { key: "bakery", emoji: "🥖", label: "Boulangerie", query: "bakery" },
  { key: "fuel", emoji: "⛽", label: "Station", query: "fuel" },
];

interface MapFullProps {
  markers: MapMarker[];
  center?: [number, number];
  onClose: () => void;
  deviceMarkers?: MapMarker[];
}

export default function MapFull({ markers, center = [46.2044, 5.226], onClose, deviceMarkers = [] }: MapFullProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapMarker[]>([]);
  const [poiMarkers, setPoiMarkers] = useState<MapMarker[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<"lieux" | "recherche">("lieux");

  // Search places via Nominatim
  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=fr&limit=8&addressdetails=1`,
        { headers: { "User-Agent": "FlowTime/1.0" } }
      );
      const data = await res.json();
      setSearchResults(
        data.map((r: { display_name: string; lat: string; lon: string; type?: string }) => ({
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          emoji: "📍",
          name: r.display_name.split(",")[0],
          detail: r.display_name,
          type: "poi" as const,
        }))
      );
    } catch { setSearchResults([]); }
    setSearching(false);
  }, []);

  // Search POI by category via Overpass API
  async function searchPOI(category: typeof POI_CATEGORIES[0]) {
    if (activeCategory === category.key) {
      setActiveCategory(null);
      setPoiMarkers([]);
      return;
    }
    setActiveCategory(category.key);
    setSearching(true);
    try {
      const [lat, lng] = center;
      const radius = 3000; // 3km
      const query = `[out:json][timeout:10];node["amenity"="${category.query}"](around:${radius},${lat},${lng});out body 20;`;
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const data = await res.json();
      setPoiMarkers(
        (data.elements || []).map((el: { lat: number; lon: number; tags?: { name?: string; [k: string]: string | undefined } }) => ({
          lat: el.lat,
          lng: el.lon,
          emoji: category.emoji,
          name: el.tags?.name || category.label,
          detail: el.tags?.["addr:street"] ? `${el.tags["addr:housenumber"] || ""} ${el.tags["addr:street"]}`.trim() : undefined,
          type: "poi" as const,
        }))
      );
    } catch { setPoiMarkers([]); }
    setSearching(false);
  }

  // Debounce search
  useEffect(() => {
    if (tab !== "recherche" || searchQuery.length < 3) { setSearchResults([]); return; }
    const t = setTimeout(() => searchPlaces(searchQuery), 500);
    return () => clearTimeout(t);
  }, [searchQuery, tab, searchPlaces]);

  const allMarkers = [...markers, ...deviceMarkers, ...poiMarkers, ...searchResults];

  return (
    <div className="fixed inset-0" style={{ zIndex: 1000, background: "var(--bg)" }}>
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex flex-col gap-2" style={{ zIndex: 1001, maxWidth: 430, margin: "0 auto" }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: "rgba(255,107,107,0.2)", color: "var(--red)" }}>
              🔴 En direct
            </span>
            {searching && <span className="text-xs animate-pulse" style={{ color: "var(--dim)" }}>Recherche...</span>}
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-sm font-bold"
            style={{ background: "var(--surface2)" }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--surface)" }}>
          <button
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors"
            style={{ background: tab === "lieux" ? "var(--accent)" : "transparent", color: tab === "lieux" ? "#fff" : "var(--dim)" }}
            onClick={() => { setTab("lieux"); setSearchResults([]); }}
          >
            📍 Lieux
          </button>
          <button
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors"
            style={{ background: tab === "recherche" ? "var(--accent)" : "transparent", color: tab === "recherche" ? "#fff" : "var(--dim)" }}
            onClick={() => { setTab("recherche"); setActiveCategory(null); setPoiMarkers([]); }}
          >
            🔍 Recherche
          </button>
        </div>

        {/* Categories or search input */}
        {tab === "lieux" ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {POI_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors"
                style={{
                  background: activeCategory === cat.key ? "var(--accent)" : "var(--surface)",
                  color: activeCategory === cat.key ? "#fff" : "var(--text)",
                }}
                onClick={() => searchPOI(cat)}
              >
                {cat.emoji} {cat.label}
              </button>
            ))}
          </div>
        ) : (
          <input
            placeholder="Rechercher un lieu, une adresse..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="!rounded-xl !text-sm"
            autoFocus
          />
        )}

        {/* Legend */}
        <div className="flex gap-2 overflow-x-auto">
          {markers.map((m, i) => (
            <span key={`a-${i}`} className="flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-bold" style={{ background: "var(--surface)" }}>
              {m.emoji} {m.name}
            </span>
          ))}
          {deviceMarkers.map((m, i) => (
            <span key={`d-${i}`} className="flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-bold" style={{ background: "rgba(61,214,200,0.15)", color: "var(--teal)" }}>
              {m.emoji} {m.name}
            </span>
          ))}
        </div>
      </div>

      <MapView markers={allMarkers} center={center} interactive height="100dvh" zoom={14} />
    </div>
  );
}
