"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useMemo, useState } from "react";
import { DEFAULT_MEMBER_COLOR } from "@/lib/constants";

// Disable Leaflet's tap handler globally to fix iOS touch issues (300ms delay)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(L.Map as any).mergeOptions({ tap: false });

export interface MapMarker {
  id?: string;
  lat: number;
  lng: number;
  emoji: string;
  name: string;
  color?: string;
  type: "member" | "address" | "device" | "poi" | "mylocation";
  detail?: string;
  updatedAt?: string;
  draggable?: boolean;
  avatarUrl?: string;
  etaMinutes?: number | null;
}

export type MapStyle = "apple" | "dark" | "satellite";

export const MAP_TILES: Record<MapStyle, { url: string; attribution?: string }> = {
  apple: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
};

export interface RouteInfo {
  coordinates: [number, number][];
  distance: number;
  duration: number;
}

export interface SafeZoneConfig {
  center: [number, number];
  radius: number;
  visible: boolean;
}

interface MapViewProps {
  markers: MapMarker[];
  center?: [number, number];
  interactive?: boolean;
  height?: string;
  onMapClick?: () => void;
  zoom?: number;
  mapStyle?: MapStyle;
  route?: RouteInfo | null;
  onMarkerDragEnd?: (marker: MapMarker, newLat: number, newLng: number) => void;
  skipFitBounds?: boolean;
  safeZone?: SafeZoneConfig | null;
  onLongPress?: (lat: number, lng: number) => void;
}

function DraggableMarker({ m, icon, interactive, onDragEnd }: {
  m: MapMarker;
  icon: L.DivIcon;
  interactive?: boolean;
  onDragEnd?: (marker: MapMarker, lat: number, lng: number) => void;
}) {
  const markerRef = useRef<L.Marker>(null);
  const eventHandlers = useMemo(() => ({
    dragend() {
      const mk = markerRef.current;
      if (mk && onDragEnd) {
        const pos = mk.getLatLng();
        onDragEnd(m, pos.lat, pos.lng);
      }
    },
  }), [m, onDragEnd]);

  return (
    <Marker
      ref={markerRef}
      position={[m.lat, m.lng]}
      icon={icon}
      draggable={true}
      eventHandlers={eventHandlers}
    >
      {interactive && (
        <Popup>
          {/* Popup Leaflet — toujours light-mode, couleurs intentionnellement fixes */}
          <div style={{ color: "#1D1D1F", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", padding: "2px 0" }}>
            <strong style={{ fontSize: 13 }}>{m.emoji} {m.name}</strong>
            {m.detail && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#86868B" }}>{m.detail}</p>}
            <p style={{ margin: "4px 0 0", fontSize: 10, color: "#007AFF" }}>Deplacez le marqueur pour ajuster</p>
          </div>
        </Popup>
      )}
    </Marker>
  );
}

function createIcon(marker: MapMarker) {
  // Apple Maps style blue dot for user location
  if (marker.type === "mylocation") {
    return L.divIcon({
      className: "",
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
        <span style="position:absolute;width:40px;height:40px;border-radius:50%;background:var(--accent-soft);animation:pulse 2s infinite"></span>
        <span style="width:14px;height:14px;border-radius:50%;background:var(--accent);border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.3);position:relative;z-index:1"></span>
      </div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  // Avatar circle for members/devices
  if (marker.type === "member" || marker.type === "device") {
    const color = marker.color || DEFAULT_MEMBER_COLOR;
    const size = 40;
    const avatarContent = marker.avatarUrl
      ? `<img src="${marker.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:18px">${marker.emoji}</span>`
      : `<span style="display:flex;width:100%;height:100%;align-items:center;justify-content:center;font-size:18px">${marker.emoji}</span>`;

    // ETA badge
    const etaBadge = marker.etaMinutes != null
      ? `<div style="
          position:absolute;top:-6px;right:-14px;
          background:var(--accent);color:#fff;
          font-size:8px;font-weight:800;
          padding:1px 4px;border-radius:6px;
          white-space:nowrap;z-index:2;
          box-shadow:0 1px 4px rgba(0,0,0,0.3);
        ">${marker.etaMinutes} min</div>`
      : "";

    return L.divIcon({
      className: "",
      html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
        ${etaBadge}
        <span style="position:absolute;width:${size + 10}px;height:${size + 10}px;border-radius:50%;background:${color}25;animation:pulse 2s infinite;top:-5px;left:-5px"></span>
        <div style="
          width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;
          border:3px solid ${color};
          box-shadow:0 2px 10px rgba(0,0,0,0.25);
          position:relative;z-index:1;
          background:var(--surface-solid);
        ">${avatarContent}</div>
        <div style="
          margin-top:2px;padding:1px 6px;border-radius:8px;
          background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);
          position:relative;z-index:1;
        ">
          <span style="font-size:9px;font-weight:700;color:#fff;white-space:nowrap">${marker.name.split(" ")[0]}</span>
        </div>
      </div>`,
      iconSize: [size, size + 18],
      iconAnchor: [size / 2, size / 2],
    });
  }

  // Apple-style circular POI pin
  if (marker.type === "poi") {
    return L.divIcon({
      className: "",
      html: `<div style="display:flex;flex-direction:column;align-items:center">
        <div style="
          background:#fff;
          border-radius:50%;
          width:32px;height:32px;
          display:flex;align-items:center;justify-content:center;
          font-size:16px;
          box-shadow:0 2px 10px rgba(0,0,0,0.15),0 1px 3px rgba(0,0,0,0.1);
          border:1px solid rgba(0,0,0,0.06);
        ">${marker.emoji}</div>
        <div style="width:2px;height:4px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.1)"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.2)"></div>
      </div>`,
      iconSize: [32, 43],
      iconAnchor: [16, 43],
    });
  }

  // Apple-style address pin (rounded square capsule)
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="
        background:#fff;
        border-radius:12px;
        padding:5px 8px;
        display:flex;align-items:center;gap:4px;
        font-size:16px;
        box-shadow:0 2px 12px rgba(0,0,0,0.15),0 1px 3px rgba(0,0,0,0.1);
        border:1px solid rgba(0,0,0,0.06);
      ">
        <span style="line-height:1">${marker.emoji}</span>
        <span style="font-size:10px;font-weight:600;color:#1D1D1F;white-space:nowrap;max-width:70px;overflow:hidden;text-overflow:ellipsis">${marker.name}</span>
      </div>
      <div style="width:2px;height:6px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.1)"></div>
      <div style="width:6px;height:6px;border-radius:50%;background:var(--red);box-shadow:0 1px 4px rgba(0,0,0,0.2)"></div>
    </div>`,
    iconSize: [40, 50],
    iconAnchor: [20, 50],
  });
}

function LiveMarker({ marker: m, interactive }: { marker: MapMarker; interactive?: boolean }) {
  const markerRef = useRef<L.Marker>(null);

  // Update position smoothly when coords change
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setLatLng([m.lat, m.lng]);
    }
  }, [m.lat, m.lng]);

  // Update icon when marker data changes
  useEffect(() => {
    if (markerRef.current) {
      markerRef.current.setIcon(createIcon(m));
    }
  }, [m.emoji, m.name, m.color, m.type, m.avatarUrl, m.etaMinutes]);

  return (
    <Marker ref={markerRef} position={[m.lat, m.lng]} icon={createIcon(m)}>
      {interactive && (
        <Popup>
          {/* Popup Leaflet — toujours light-mode, couleurs intentionnellement fixes */}
          <div style={{ color: "#1D1D1F", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", padding: "2px 0" }}>
            <strong style={{ fontSize: 13 }}>{m.emoji} {m.name}</strong>
            {m.detail && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#86868B" }}>{m.detail}</p>}
            {m.etaMinutes != null && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#007AFF", fontWeight: 600 }}>🏠 {m.etaMinutes} min</p>}
            {m.updatedAt && <p style={{ margin: "2px 0 0", fontSize: 10, color: "#AEAEB2" }}>Mis a jour : {new Date(m.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>}
          </div>
        </Popup>
      )}
    </Marker>
  );
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

function FlyTo({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  const prevKey = useRef<string | null>(null);
  useEffect(() => {
    const key = `${center[0]},${center[1]},${zoom}`;
    if (prevKey.current === null) {
      // Skip first render — MapContainer already set the initial view
      prevKey.current = key;
      return;
    }
    if (key === prevKey.current) return;
    prevKey.current = key;
    map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.8 });
  }, [map, center, zoom]);
  return null;
}

function FitBoundsOnce({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    if (markers.length > 1) {
      fitted.current = true;
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [markers, map]);
  return null;
}

function FitRoute({ route }: { route: RouteInfo }) {
  const map = useMap();
  useEffect(() => {
    if (route.coordinates.length > 1) {
      const bounds = L.latLngBounds(route.coordinates);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }, [route, map]);
  return null;
}

/** Détecte un long press sur la carte (contextmenu sur mobile) */
function LongPressHandler({ onLongPress }: { onLongPress: (lat: number, lng: number) => void }) {
  useMapEvents({
    contextmenu(e) {
      onLongPress(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Spread overlapping markers in a circle so they don't stack
function spreadOverlapping(markers: MapMarker[]): MapMarker[] {
  const THRESHOLD = 0.0003; // ~30m — considered "same spot"
  const OFFSET = 0.00015; // ~15m spread radius
  const groups = new Map<string, number[]>();

  // Group markers that are very close together
  markers.forEach((m, i) => {
    let foundKey: string | null = null;
    for (const [key] of groups) {
      const [refLat, refLng] = key.split(",").map(Number);
      if (Math.abs(m.lat - refLat) < THRESHOLD && Math.abs(m.lng - refLng) < THRESHOLD) {
        foundKey = key;
        break;
      }
    }
    if (foundKey) {
      groups.get(foundKey)!.push(i);
    } else {
      groups.set(`${m.lat},${m.lng}`, [i]);
    }
  });

  const result = [...markers];
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const n = indices.length;
    indices.forEach((idx, j) => {
      const angle = (2 * Math.PI * j) / n - Math.PI / 2;
      result[idx] = {
        ...result[idx],
        lat: result[idx].lat + OFFSET * Math.sin(angle),
        lng: result[idx].lng + OFFSET * Math.cos(angle),
      };
    });
  }
  return result;
}

/** Returns "apple" for light theme, "dark" for dark theme. Reacts to theme changes. */
export function useThemeMapStyle(): MapStyle {
  const [style, setStyle] = useState<MapStyle>(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.classList.contains("light") ? "apple" : "dark";
  });
  useEffect(() => {
    const check = () =>
      setStyle(document.documentElement.classList.contains("light") ? "apple" : "dark");
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return style;
}

/** Lit une variable CSS résolue (hex) pour les APIs qui ne supportent pas var() */
function getCSSColor(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

export default function MapView({
  markers: rawMarkers,
  center = [46.2044, 5.226],
  interactive = false,
  height = "200px",
  onMapClick,
  zoom = 12,
  mapStyle = "apple",
  route,
  onMarkerDragEnd,
  skipFitBounds = false,
  safeZone,
  onLongPress,
}: MapViewProps) {
  const tile = MAP_TILES[mapStyle];
  const markers = useMemo(() => spreadOverlapping(rawMarkers), [rawMarkers]);
  const accentHex = getCSSColor("--accent", "#7C6BF0");
  const tealHex = getCSSColor("--teal", "#5ED4C8");

  return (
    <div
      style={{ height, borderRadius: interactive ? 0 : 16, overflow: "hidden", cursor: onMapClick ? "pointer" : "default" }}
      onClick={onMapClick}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%", background: "var(--bg)" }}
        dragging={interactive}
        zoomControl={false}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        attributionControl={false}
      >
        <TileLayer url={tile.url} />
        <InvalidateSize />
        {interactive && <FlyTo center={center} zoom={zoom} />}
        {interactive && markers.length > 1 && !route && !skipFitBounds && <FitBoundsOnce markers={markers} />}
        {route && route.coordinates.length > 1 && <FitRoute route={route} />}
        {onLongPress && <LongPressHandler onLongPress={onLongPress} />}

        {/* Rayon de sécurité */}
        {safeZone && safeZone.visible && (
          <Circle
            center={safeZone.center}
            radius={safeZone.radius}
            pathOptions={{
              color: tealHex,
              weight: 2,
              opacity: 0.6,
              fillColor: tealHex,
              fillOpacity: 0.08,
              dashArray: "6 4",
            }}
          />
        )}

        {/* Route border (wider, darker) */}
        {route && route.coordinates.length > 1 && (
          <Polyline
            positions={route.coordinates}
            pathOptions={{ color: accentHex, weight: 8, opacity: 0.3, lineCap: "round", lineJoin: "round" }}
          />
        )}
        {/* Route line */}
        {route && route.coordinates.length > 1 && (
          <Polyline
            positions={route.coordinates}
            pathOptions={{ color: accentHex, weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
          />
        )}
        {markers.map((m, i) => (
          m.draggable && onMarkerDragEnd ? (
            <DraggableMarker
              key={m.id || `drag-${i}`}
              m={m}
              icon={createIcon(m)}
              interactive={interactive}
              onDragEnd={onMarkerDragEnd}
            />
          ) : (
            <LiveMarker key={m.id || `${m.type}-${m.name}-${i}`} marker={m} interactive={interactive} />
          )
        ))}
      </MapContainer>
    </div>
  );
}
