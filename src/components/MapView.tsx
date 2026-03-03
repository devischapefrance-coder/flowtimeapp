"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

export interface MapMarker {
  lat: number;
  lng: number;
  emoji: string;
  name: string;
  color?: string;
  type: "member" | "address" | "device" | "poi" | "mylocation";
  detail?: string;
  updatedAt?: string;
}

export type MapStyle = "dark" | "standard" | "satellite";

export const MAP_TILES: Record<MapStyle, { url: string; attribution?: string }> = {
  dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" },
  standard: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" },
};

export interface RouteInfo {
  coordinates: [number, number][];
  distance: number; // meters
  duration: number; // seconds
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
}

function createIcon(marker: MapMarker) {
  if (marker.type === "mylocation") {
    return L.divIcon({
      className: "",
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center">
        <span style="position:absolute;width:36px;height:36px;border-radius:50%;background:rgba(66,133,244,0.25);animation:pulse 2s infinite"></span>
        <span style="width:16px;height:16px;border-radius:50%;background:#4285F4;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);position:relative;z-index:1"></span>
      </div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }
  if (marker.type === "member" || marker.type === "device") {
    const pulseRing = marker.type === "device"
      ? `<span style="position:absolute;width:32px;height:32px;border-radius:50%;background:${marker.color || "var(--teal)"}33;animation:pulse 2s infinite;top:-5px;left:-1px"></span>`
      : "";
    return L.divIcon({
      className: "",
      html: `<div style="display:flex;flex-direction:column;align-items:center;position:relative">
        ${pulseRing}
        <span style="font-size:22px;position:relative;z-index:1">${marker.emoji}</span>
        <span style="width:8px;height:8px;border-radius:50%;background:${marker.color || "var(--teal)"};display:block;margin-top:2px;position:relative;z-index:1"></span>
      </div>`,
      iconSize: [30, 36],
      iconAnchor: [15, 36],
    });
  }
  if (marker.type === "poi") {
    return L.divIcon({
      className: "",
      html: `<div style="background:var(--accent);border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">${marker.emoji}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });
  }
  return L.divIcon({
    className: "",
    html: `<div style="background:var(--surface2);border-radius:10px;padding:5px 7px;font-size:18px;border:1.5px solid rgba(255,255,255,0.12);box-shadow:0 2px 8px rgba(0,0,0,0.3)">${marker.emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  });
}

function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length > 1) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
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

export default function MapView({
  markers,
  center = [46.2044, 5.226],
  interactive = false,
  height = "200px",
  onMapClick,
  zoom = 12,
  mapStyle = "dark",
  route,
}: MapViewProps) {
  const tile = MAP_TILES[mapStyle];

  return (
    <div
      style={{ height, borderRadius: interactive ? 0 : 16, overflow: "hidden", cursor: onMapClick ? "pointer" : "default" }}
      onClick={onMapClick}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        dragging={interactive}
        zoomControl={false}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        attributionControl={false}
      >
        <TileLayer url={tile.url} />
        {interactive && markers.length > 1 && !route && <FitBounds markers={markers} />}
        {route && route.coordinates.length > 1 && <FitRoute route={route} />}
        {route && route.coordinates.length > 1 && (
          <Polyline
            positions={route.coordinates}
            pathOptions={{ color: "#4285F4", weight: 5, opacity: 0.85, lineCap: "round", lineJoin: "round" }}
          />
        )}
        {markers.map((m, i) => (
          <Marker key={`${m.lat}-${m.lng}-${i}`} position={[m.lat, m.lng]} icon={createIcon(m)}>
            {interactive && (
              <Popup>
                <div style={{ color: "#1C1510", fontFamily: "sans-serif" }}>
                  <strong>{m.emoji} {m.name}</strong>
                  {m.detail && <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.7 }}>{m.detail}</p>}
                  {m.updatedAt && <p style={{ margin: "2px 0 0", fontSize: 10, opacity: 0.5 }}>Mis a jour : {new Date(m.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>}
                </div>
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
