"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import type { MapMarker, MapStyle } from "./MapView";
import { supabase } from "@/lib/supabase";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const POI_CATEGORIES = [
  { key: "restaurant", emoji: "🍽️", label: "Restaurant", tags: [["amenity","restaurant"],["amenity","fast_food"]] },
  { key: "cafe", emoji: "☕", label: "Cafe", tags: [["amenity","cafe"],["amenity","ice_cream"]] },
  { key: "supermarket", emoji: "🛒", label: "Courses", tags: [["shop","supermarket"],["shop","convenience"],["shop","greengrocer"],["shop","butcher"],["shop","deli"]] },
  { key: "bakery", emoji: "🥖", label: "Boulangerie", tags: [["shop","bakery"],["shop","pastry"]] },
  { key: "pharmacy", emoji: "💊", label: "Pharmacie", tags: [["amenity","pharmacy"]] },
  { key: "hospital", emoji: "🏥", label: "Sante", tags: [["amenity","hospital"],["amenity","clinic"],["amenity","doctors"],["amenity","dentist"],["healthcare","doctor"],["healthcare","centre"]] },
  { key: "school", emoji: "🏫", label: "Ecole", tags: [["amenity","school"],["amenity","kindergarten"],["amenity","college"],["amenity","university"]] },
  { key: "fuel", emoji: "⛽", label: "Station", tags: [["amenity","fuel"],["amenity","charging_station"]] },
  { key: "bank", emoji: "🏦", label: "Banque", tags: [["amenity","bank"],["amenity","atm"]] },
  { key: "park", emoji: "🌳", label: "Parc", tags: [["leisure","park"],["leisure","garden"],["leisure","playground"]] },
  { key: "sport", emoji: "⚽", label: "Sport", tags: [["leisure","sports_centre"],["leisure","fitness_centre"],["leisure","swimming_pool"],["leisure","stadium"]] },
  { key: "shopping", emoji: "🛍️", label: "Shopping", tags: [["shop","clothes"],["shop","shoes"],["shop","mall"],["shop","department_store"],["shop","hairdresser"],["shop","beauty"]] },
  { key: "post_office", emoji: "📮", label: "Poste", tags: [["amenity","post_office"]] },
  { key: "cinema", emoji: "🎬", label: "Loisirs", tags: [["amenity","cinema"],["amenity","theatre"],["amenity","library"],["tourism","museum"]] },
  { key: "hotel", emoji: "🏨", label: "Hotel", tags: [["tourism","hotel"],["tourism","guest_house"],["tourism","hostel"]] },
  { key: "garage", emoji: "🔧", label: "Garage", tags: [["shop","car_repair"],["shop","car"],["amenity","car_wash"]] },
];

const MAP_STYLES: { key: MapStyle; label: string; icon: string }[] = [
  { key: "apple", label: "Standard", icon: "🗺️" },
  { key: "dark", label: "Sombre", icon: "🌙" },
  { key: "satellite", label: "Satellite", icon: "🛰️" },
];

interface MapFullProps {
  markers: MapMarker[];
  center?: [number, number];
  onClose: () => void;
  deviceMarkers?: MapMarker[];
  onAddressMoved?: (id: string, lat: number, lng: number, address: string) => void;
  familyId?: string;
  initialZoom?: number;
}

type SideTab = "lieux" | "recherche" | null;

export default function MapFull({ markers, center = [46.2044, 5.226], onClose, deviceMarkers: initialDeviceMarkers = [], onAddressMoved, familyId, initialZoom }: MapFullProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [liveDevices, setLiveDevices] = useState<MapMarker[]>(initialDeviceMarkers);
  const [searchResults, setSearchResults] = useState<MapMarker[]>([]);
  const [poiMarkers, setPoiMarkers] = useState<MapMarker[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<SideTab>(null);
  const [showStylePicker, setShowStylePicker] = useState(false);

  // Detect light/dark theme
  const [isLight, setIsLight] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.classList.contains("light") ? "apple" : "dark";
  });
  useEffect(() => {
    const check = () => {
      const light = document.documentElement.classList.contains("light");
      setIsLight(light);
      setMapStyle((prev) => prev === "satellite" ? prev : (light ? "apple" : "dark"));
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Theme-aware colors
  const t = {
    panelBg: isLight ? "rgba(255,255,255,0.92)" : "rgba(30,32,42,0.92)",
    stripBg: isLight ? "rgba(255,255,255,0.95)" : "rgba(30,32,42,0.95)",
    pillBg: isLight ? "rgba(255,255,255,0.95)" : "rgba(30,32,42,0.95)",
    text: isLight ? "#1D1D1F" : "#ECEEF4",
    textDim: isLight ? "#86868B" : "rgba(236,238,244,0.5)",
    inputBg: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
    catBg: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.06)",
    hoverBg: isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.08)",
    border: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
    divider: isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.12)",
    badgeBg: isLight ? "rgba(255,255,255,0.95)" : "rgba(30,32,42,0.95)",
    accent: "#007AFF",
    red: "#FF3B30",
    green: "#34C759",
    deviceBg: isLight ? "rgba(0,122,255,0.08)" : "rgba(0,122,255,0.15)",
  };

  // Drag feedback
  const [dragToast, setDragToast] = useState<string | null>(null);

  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const [mapZoom, setMapZoom] = useState(initialZoom || 14);
  const watchRef = useRef<number | null>(null);


  // Reverse geocode + update address on marker drag
  async function handleMarkerDragEnd(marker: MapMarker, newLat: number, newLng: number) {
    if (!marker.id || !onAddressMoved) return;
    setDragToast("Mise a jour de l'adresse...");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${newLat}&lon=${newLng}&zoom=18&addressdetails=1`,
        { headers: { "User-Agent": "FlowTime/1.0" } }
      );
      const data = await res.json();
      const newAddress = data.display_name || `${newLat.toFixed(5)}, ${newLng.toFixed(5)}`;
      const shortAddr = newAddress.split(",").slice(0, 3).join(",").trim();
      onAddressMoved(marker.id, newLat, newLng, shortAddr);
      setDragToast(`${marker.emoji} ${marker.name} → ${shortAddr}`);
    } catch {
      onAddressMoved(marker.id, newLat, newLng, `${newLat.toFixed(5)}, ${newLng.toFixed(5)}`);
      setDragToast(`${marker.emoji} Position mise a jour`);
    }
    setTimeout(() => setDragToast(null), 3000);
  }

  function locateMe() {
    // Toggle off: if already tracking, stop and remove pin
    if (myLocation) {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      setMyLocation(null);
      return;
    }
    // Toggle on: get position and start watching
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyLocation(loc);
        setMapCenter(loc);
        setMapZoom(17);
      },
      () => alert("Impossible d'acceder a la geolocalisation"),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setMyLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  }

  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // Real-time device location tracking
  useEffect(() => {
    if (!familyId) return;
    const channel = supabase
      .channel("mapfull-devices")
      .on("postgres_changes", { event: "*", schema: "public", table: "device_locations", filter: `family_id=eq.${familyId}` },
        () => {
          supabase.from("device_locations").select("*").eq("family_id", familyId).then(({ data }) => {
            if (data) {
              setLiveDevices(data.map((d: { id: string; lat: number; lng: number; emoji: string; device_name: string; updated_at: string }) => ({
                id: d.id,
                lat: d.lat,
                lng: d.lng,
                emoji: d.emoji || "📱",
                name: d.device_name,
                color: "#3DD6C8",
                type: "device" as const,
                updatedAt: d.updated_at,
              })));
            }
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId]);

  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) return;
    setSearching(true);
    try {
      const [lat, lng] = mapCenter;
      const vb = `${lng - 0.15},${lat + 0.15},${lng + 0.15},${lat - 0.15}`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=fr&limit=15&addressdetails=1&viewbox=${vb}&bounded=0`,
        { headers: { "User-Agent": "FlowTime/1.0" } }
      );
      const data = await res.json();
      setSearchResults(
        data.map((r: { display_name: string; lat: string; lon: string; type?: string; class?: string }) => ({
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          emoji: r.class === "shop" ? "🏪" : r.class === "amenity" ? "📌" : r.class === "tourism" ? "🏛️" : "📍",
          name: r.display_name.split(",")[0],
          detail: r.display_name.split(",").slice(0, 3).join(","),
          type: "poi" as const,
        }))
      );
    } catch { setSearchResults([]); }
    setSearching(false);
  }, [mapCenter]);

  async function searchPOI(category: typeof POI_CATEGORIES[0]) {
    if (activeCategory === category.key) {
      setActiveCategory(null);
      setPoiMarkers([]);
      return;
    }
    setActiveCategory(category.key);
    setSearching(true);
    try {
      const [lat, lng] = mapCenter;
      const radius = 5000;
      const tagQueries = category.tags
        .map(([k, v]) => `node["${k}"="${v}"](around:${radius},${lat},${lng});`)
        .join("");
      const query = `[out:json][timeout:15];(${tagQueries});out body 40;`;
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const data = await res.json();
      const seen = new Set<string>();
      const results = (data.elements || [])
        .map((el: { lat: number; lon: number; tags?: { name?: string; [k: string]: string | undefined } }) => {
          const name = el.tags?.name || category.label;
          const dedup = `${name}-${el.lat.toFixed(4)}`;
          if (seen.has(dedup)) return null;
          seen.add(dedup);
          const addr = el.tags?.["addr:street"]
            ? `${el.tags["addr:housenumber"] || ""} ${el.tags["addr:street"]}`.trim()
            : undefined;
          const opening = el.tags?.opening_hours;
          return {
            lat: el.lat,
            lng: el.lon,
            emoji: category.emoji,
            name,
            detail: [addr, opening].filter(Boolean).join(" · "),
            type: "poi" as const,
          };
        })
        .filter(Boolean)
        .slice(0, 30);
      setPoiMarkers(results);
    } catch { setPoiMarkers([]); }
    setSearching(false);
  }

  useEffect(() => {
    if (tab !== "recherche" || searchQuery.length < 3) { setSearchResults([]); return; }
    const t = setTimeout(() => searchPlaces(searchQuery), 500);
    return () => clearTimeout(t);
  }, [searchQuery, tab, searchPlaces]);

  const myLocationMarker: MapMarker[] = myLocation
    ? [{ lat: myLocation[0], lng: myLocation[1], emoji: "📍", name: "Ma position", type: "mylocation" }]
    : [];

  const allMarkers = useMemo(() => [...markers, ...liveDevices, ...poiMarkers, ...searchResults, ...myLocationMarker], [markers, liveDevices, poiMarkers, searchResults, myLocationMarker]);

  const panelOpen = tab !== null;

  function switchTab(t: SideTab) {
    if (tab === t) {
      setTab(null);
      return;
    }
    setTab(t);
    if (t !== "recherche") setSearchResults([]);
    if (t !== "lieux") { setActiveCategory(null); setPoiMarkers([]); }
  }

  function flyTo(lat: number, lng: number) {
    setMapCenter([lat, lng]);
    setMapZoom(17);
    setTab(null);
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 1000, background: "var(--bg)" }}>
      {/* Top bar - minimal, safe area for notch/Dynamic Island */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4" style={{ zIndex: 1002, paddingTop: "max(16px, env(safe-area-inset-top, 16px))" }}>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold shadow-lg" style={{ background: t.badgeBg, color: t.red }}>
            🔴 En direct
          </span>
          {searching && <span className="text-[10px] animate-pulse px-2 py-1 rounded-full font-medium shadow-sm" style={{ background: t.pillBg, color: t.textDim }}>Recherche...</span>}
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-full text-sm font-bold shadow-lg"
          style={{ background: t.pillBg, color: t.text }}
        >
          ✕
        </button>
      </div>

      {/* Left icon strip */}
      <div
        className="absolute left-2 flex flex-col gap-1.5 p-1.5 rounded-2xl shadow-xl"
        style={{
          zIndex: 1002,
          top: "50%",
          transform: "translateY(-50%)",
          background: t.stripBg,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {([
          { key: "lieux" as const, icon: "📍", label: "Lieux" },
          { key: "recherche" as const, icon: "🔍", label: "Chercher" },
        ]).map((item) => (
          <button
            key={item.key}
            onClick={() => switchTab(item.key)}
            className="w-10 h-10 flex flex-col items-center justify-center rounded-xl transition-all"
            style={{
              background: tab === item.key ? t.accent : "transparent",
              color: tab === item.key ? "#fff" : t.text,
            }}
            title={item.label}
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span className="text-[7px] font-bold mt-0.5 leading-none">{item.label}</span>
          </button>
        ))}

        <div className="w-6 h-px mx-auto my-0.5" style={{ background: t.divider }} />

        {/* GPS button */}
        <button
          onClick={locateMe}
          className="w-10 h-10 flex items-center justify-center rounded-xl transition-all"
          style={{ background: myLocation ? t.accent : "transparent", color: myLocation ? "#fff" : t.text }}
          title="Ma position"
        >
          <span className="text-base">{myLocation ? "📍" : "🎯"}</span>
        </button>

        {/* Map style button */}
        <div className="relative">
          <button
            onClick={() => setShowStylePicker(!showStylePicker)}
            className="w-10 h-10 flex items-center justify-center rounded-xl"
            style={{ color: t.text }}
            title="Style de carte"
          >
            <span className="text-base">🗺️</span>
          </button>
          {showStylePicker && (
            <div
              className="absolute left-full ml-2 top-0 flex flex-col gap-0.5 p-1.5 rounded-xl shadow-xl"
              style={{ background: t.stripBg, backdropFilter: "blur(20px)", minWidth: 120 }}
            >
              {MAP_STYLES.map((s) => (
                <button
                  key={s.key}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left"
                  style={{
                    background: mapStyle === s.key ? t.accent : "transparent",
                    color: mapStyle === s.key ? "#fff" : t.text,
                  }}
                  onClick={() => { setMapStyle(s.key); setShowStylePicker(false); }}
                >
                  {s.icon} {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Side panel - slides from left */}
      <div
        className="absolute top-0 bottom-0 overflow-hidden"
        style={{
          zIndex: 1001,
          left: 56,
          width: panelOpen ? 280 : 0,
          transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <div
          className="h-full flex flex-col overflow-y-auto"
          style={{
            width: 280,
            background: t.panelBg,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderRight: `1px solid ${t.border}`,
          }}
        >
          {/* Panel header — offset for safe area */}
          <div className="px-4 pb-3" style={{ paddingTop: "max(60px, calc(env(safe-area-inset-top, 16px) + 44px))" }}>
            <h2 className="text-base font-bold" style={{ color: t.text }}>
              {tab === "lieux" ? "Lieux a proximite" : tab === "recherche" ? "Rechercher" : ""}
            </h2>
          </div>

          {/* Lieux tab */}
          {tab === "lieux" && (
            <div className="flex-1 px-3 pb-4">
              <div className="grid grid-cols-3 gap-1.5">
                {POI_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl transition-all"
                    style={{
                      background: activeCategory === cat.key ? t.accent : t.catBg,
                      color: activeCategory === cat.key ? "#fff" : t.text,
                    }}
                    onClick={() => searchPOI(cat)}
                  >
                    <span className="text-lg leading-none">{cat.emoji}</span>
                    <span className="text-[9px] font-semibold leading-tight text-center">{cat.label}</span>
                  </button>
                ))}
              </div>

              {/* POI results list */}
              {poiMarkers.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider px-1 mb-2" style={{ color: t.textDim }}>
                    {poiMarkers.length} résultats
                  </p>
                  <div className="flex flex-col gap-1">
                    {poiMarkers.map((poi, i) => (
                      <button
                        key={i}
                        className="flex items-start gap-2 px-3 py-2 rounded-xl text-left transition-colors"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = t.hoverBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => flyTo(poi.lat, poi.lng)}
                      >
                        <span className="text-sm mt-0.5">{poi.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: t.text }}>{poi.name}</p>
                          {poi.detail && (
                            <p className="text-[10px] truncate mt-0.5" style={{ color: t.textDim }}>{poi.detail}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Legend */}
              {(markers.length > 0 || liveDevices.length > 0) && (
                <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${t.border}` }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider px-1 mb-2" style={{ color: t.textDim }}>
                    Vos adresses
                  </p>
                  <div className="flex flex-col gap-1">
                    {markers.map((m, i) => (
                      <button
                        key={`a-${i}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors"
                        style={{ cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = t.hoverBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => flyTo(m.lat, m.lng)}
                      >
                        <span className="text-sm">{m.emoji}</span>
                        <span className="text-xs font-medium truncate" style={{ color: t.text }}>{m.name}</span>
                      </button>
                    ))}
                    {liveDevices.map((m, i) => (
                      <button
                        key={`d-${i}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-left transition-colors"
                        style={{ background: t.deviceBg, cursor: "pointer" }}
                        onClick={() => flyTo(m.lat, m.lng)}
                      >
                        <span className="text-sm">{m.emoji}</span>
                        <span className="text-xs font-medium truncate" style={{ color: t.accent }}>{m.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recherche tab */}
          {tab === "recherche" && (
            <div className="flex-1 px-3 pb-4">
              <div className="relative mb-3">
                <input
                  placeholder="Lieu, adresse, commerce..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl text-sm font-medium"
                  style={{
                    background: t.inputBg,
                    color: t.text,
                    border: "none",
                    outline: "none",
                  }}
                  autoFocus
                />
              </div>

              {searchResults.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-left transition-colors"
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = t.hoverBg)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      onClick={() => flyTo(r.lat, r.lng)}
                    >
                      <span className="text-sm mt-0.5">{r.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: t.text }}>{r.name}</p>
                        {r.detail && <p className="text-[10px] truncate mt-0.5" style={{ color: t.textDim }}>{r.detail}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length > 0 && searchResults.length === 0 && !searching && (
                <p className="text-xs text-center py-8" style={{ color: t.textDim }}>Aucun résultat</p>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Drag toast */}
      {dragToast && (
        <div
          className="absolute left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold animate-in"
          style={{ zIndex: 1003, background: t.stripBg, color: t.text, backdropFilter: "blur(20px)", maxWidth: 320, bottom: "max(32px, calc(env(safe-area-inset-bottom, 8px) + 24px))" }}
        >
          {dragToast}
        </div>
      )}

      {/* Map */}
      <MapView
        markers={allMarkers}
        center={mapCenter}
        interactive
        height="100dvh"
        zoom={mapZoom}
        mapStyle={mapStyle}
        onMarkerDragEnd={onAddressMoved ? handleMarkerDragEnd : undefined}
      />
    </div>
  );
}
