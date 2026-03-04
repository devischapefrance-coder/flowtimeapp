"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { MapMarker, MapStyle, RouteInfo } from "./MapView";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

// Each category can search multiple OSM tags (amenity, shop, leisure, tourism, office)
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
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h${m > 0 ? ` ${m}min` : ""}`;
}

export default function MapFull({ markers, center = [46.2044, 5.226], onClose, deviceMarkers = [] }: MapFullProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MapMarker[]>([]);
  const [poiMarkers, setPoiMarkers] = useState<MapMarker[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<"lieux" | "recherche" | "itineraire">("lieux");
  const [mapStyle, setMapStyle] = useState<MapStyle>("apple");
  const [showStylePicker, setShowStylePicker] = useState(false);

  // My location
  const [myLocation, setMyLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(center);
  const watchRef = useRef<number | null>(null);

  // Routing
  const [routeFrom, setRouteFrom] = useState("");
  const [routeTo, setRouteTo] = useState("");
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeMode, setRouteMode] = useState<"driving" | "walking" | "cycling">("driving");
  const [routeFromCoord, setRouteFromCoord] = useState<[number, number] | null>(null);
  const [routeToCoord, setRouteToCoord] = useState<[number, number] | null>(null);

  // Geocode an address via Nominatim
  const geocode = useCallback(async (query: string): Promise<[number, number] | null> => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { "User-Agent": "FlowTime/1.0" } }
      );
      const data = await res.json();
      if (data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    } catch { /* ignore */ }
    return null;
  }, []);

  // Fetch route via OSRM
  async function fetchRoute() {
    setRouteLoading(true);
    setRoute(null);
    try {
      let from = routeFromCoord;
      let to = routeToCoord;

      // If "Ma position" is the from field, use GPS
      if (routeFrom.toLowerCase().includes("ma position") && myLocation) {
        from = myLocation;
      } else if (!from) {
        from = await geocode(routeFrom);
      }
      if (!to) {
        to = await geocode(routeTo);
      }

      if (!from || !to) {
        setRouteLoading(false);
        return;
      }

      setRouteFromCoord(from);
      setRouteToCoord(to);

      const profile = routeMode === "driving" ? "car" : routeMode === "cycling" ? "bike" : "foot";
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/${profile}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
      );
      const data = await res.json();

      if (data.routes && data.routes.length > 0) {
        const r = data.routes[0];
        setRoute({
          coordinates: r.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]),
          distance: r.distance,
          duration: r.duration,
        });
      }
    } catch { /* ignore */ }
    setRouteLoading(false);
  }

  // Start watching my location
  function locateMe() {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMyLocation(loc);
        setMapCenter(loc);
      },
      () => alert("Impossible d'acceder a la geolocalisation"),
      { enableHighAccuracy: true }
    );
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => setMyLocation([pos.coords.latitude, pos.coords.longitude]),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
  }

  // Cleanup watch on unmount
  useEffect(() => {
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // Search places via Nominatim — with viewbox for local results + broader search
  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) return;
    setSearching(true);
    try {
      // Build viewbox around current map center (±0.15 degrees ~ 15km)
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

  // Search POI by category via Overpass API (multi-tag)
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
      // Build union query for all tags in this category
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
      // Deduplicate by name+lat and sort by distance
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

  // Debounce search
  useEffect(() => {
    if (tab !== "recherche" || searchQuery.length < 3) { setSearchResults([]); return; }
    const t = setTimeout(() => searchPlaces(searchQuery), 500);
    return () => clearTimeout(t);
  }, [searchQuery, tab, searchPlaces]);

  // Build markers list
  const myLocationMarker: MapMarker[] = myLocation
    ? [{ lat: myLocation[0], lng: myLocation[1], emoji: "📍", name: "Ma position", type: "mylocation" }]
    : [];

  const routeMarkers: MapMarker[] = [];
  if (routeFromCoord) routeMarkers.push({ lat: routeFromCoord[0], lng: routeFromCoord[1], emoji: "🟢", name: "Depart", type: "poi" });
  if (routeToCoord) routeMarkers.push({ lat: routeToCoord[0], lng: routeToCoord[1], emoji: "🔴", name: "Arrivee", type: "poi" });

  const allMarkers = [...markers, ...deviceMarkers, ...poiMarkers, ...searchResults, ...myLocationMarker, ...routeMarkers];

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
          {(["lieux", "recherche", "itineraire"] as const).map((t) => (
            <button
              key={t}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors"
              style={{ background: tab === t ? "var(--accent)" : "transparent", color: tab === t ? "#fff" : "var(--dim)" }}
              onClick={() => {
                setTab(t);
                if (t !== "recherche") setSearchResults([]);
                if (t !== "lieux") { setActiveCategory(null); setPoiMarkers([]); }
                if (t !== "itineraire") { setRoute(null); setRouteFromCoord(null); setRouteToCoord(null); }
              }}
            >
              {t === "lieux" ? "📍 Lieux" : t === "recherche" ? "🔍 Chercher" : "🧭 Trajet"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "lieux" && (
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
        )}

        {tab === "recherche" && (
          <input
            placeholder="Rechercher un lieu, une adresse..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="!rounded-xl !text-sm"
            autoFocus
          />
        )}

        {tab === "itineraire" && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                placeholder="Depart (ou 'Ma position')"
                value={routeFrom}
                onChange={(e) => { setRouteFrom(e.target.value); setRouteFromCoord(null); }}
                className="!rounded-xl !text-sm flex-1"
              />
              <button
                className="px-2 text-lg"
                title="Ma position"
                onClick={() => {
                  if (myLocation) {
                    setRouteFrom("Ma position");
                    setRouteFromCoord(myLocation);
                  } else {
                    locateMe();
                    setRouteFrom("Ma position");
                  }
                }}
              >
                📍
              </button>
            </div>
            <input
              placeholder="Destination"
              value={routeTo}
              onChange={(e) => { setRouteTo(e.target.value); setRouteToCoord(null); }}
              className="!rounded-xl !text-sm"
            />
            <div className="flex gap-1">
              {(["driving", "walking", "cycling"] as const).map((mode) => (
                <button
                  key={mode}
                  className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  style={{
                    background: routeMode === mode ? "var(--accent)" : "var(--surface)",
                    color: routeMode === mode ? "#fff" : "var(--dim)",
                  }}
                  onClick={() => { setRouteMode(mode); setRoute(null); }}
                >
                  {mode === "driving" ? "🚗 Voiture" : mode === "walking" ? "🚶 A pied" : "🚴 Velo"}
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary !py-2 !text-sm"
              onClick={fetchRoute}
              disabled={routeLoading || !routeFrom.trim() || !routeTo.trim()}
            >
              {routeLoading ? "Calcul..." : "Calculer l'itineraire"}
            </button>

            {route && (
              <div className="flex gap-3 items-center px-3 py-2 rounded-xl" style={{ background: "var(--surface)" }}>
                <div className="flex-1">
                  <p className="text-sm font-bold">{formatDistance(route.distance)}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>Distance</p>
                </div>
                <div className="w-px h-8" style={{ background: "var(--surface2)" }} />
                <div className="flex-1">
                  <p className="text-sm font-bold">{formatDuration(route.duration)}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>Duree</p>
                </div>
                <div className="w-px h-8" style={{ background: "var(--surface2)" }} />
                <div className="flex-1 text-center">
                  <p className="text-sm font-bold">{routeMode === "driving" ? "🚗" : routeMode === "walking" ? "🚶" : "🚴"}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>{routeMode === "driving" ? "Voiture" : routeMode === "walking" ? "A pied" : "Velo"}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {tab !== "itineraire" && (
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
        )}
      </div>

      {/* Right side buttons */}
      <div className="absolute flex flex-col gap-2" style={{ zIndex: 1001, right: 16, bottom: 100 }}>
        {/* My location */}
        <button
          onClick={locateMe}
          className="w-11 h-11 flex items-center justify-center rounded-full text-lg shadow-lg"
          style={{ background: myLocation ? "var(--accent)" : "var(--surface2)" }}
          title="Ma position"
        >
          {myLocation ? "📍" : "🎯"}
        </button>

        {/* Map style */}
        <div className="relative">
          <button
            onClick={() => setShowStylePicker(!showStylePicker)}
            className="w-11 h-11 flex items-center justify-center rounded-full text-lg shadow-lg"
            style={{ background: "var(--surface2)" }}
            title="Style de carte"
          >
            🗺️
          </button>
          {showStylePicker && (
            <div className="absolute right-full mr-2 bottom-0 flex flex-col gap-1 p-2 rounded-xl shadow-xl" style={{ background: "var(--surface)", minWidth: 120 }}>
              {MAP_STYLES.map((s) => (
                <button
                  key={s.key}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors text-left"
                  style={{
                    background: mapStyle === s.key ? "var(--accent)" : "transparent",
                    color: mapStyle === s.key ? "#fff" : "var(--text)",
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

      <MapView
        markers={allMarkers}
        center={mapCenter}
        interactive
        height="100dvh"
        zoom={14}
        mapStyle={mapStyle}
        route={route}
      />
    </div>
  );
}
