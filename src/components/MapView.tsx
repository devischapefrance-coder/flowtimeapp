"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

export interface MapMarker {
  lat: number;
  lng: number;
  emoji: string;
  name: string;
  color?: string;
  type: "member" | "address" | "device" | "poi";
  detail?: string;
  updatedAt?: string;
}

interface MapViewProps {
  markers: MapMarker[];
  center?: [number, number];
  interactive?: boolean;
  height?: string;
  onMapClick?: () => void;
  zoom?: number;
}

function createIcon(marker: MapMarker) {
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

export default function MapView({
  markers,
  center = [46.2044, 5.226],
  interactive = false,
  height = "200px",
  onMapClick,
  zoom = 12,
}: MapViewProps) {
  return (
    <div
      style={{ height, borderRadius: 16, overflow: "hidden", cursor: onMapClick ? "pointer" : "default" }}
      onClick={onMapClick}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        dragging={interactive}
        zoomControl={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {interactive && markers.length > 1 && <FitBounds markers={markers} />}
        {markers.map((m, i) => (
          <Marker key={`${m.lat}-${m.lng}-${i}`} position={[m.lat, m.lng]} icon={createIcon(m)}>
            {interactive && (
              <Popup>
                <div style={{ color: "#1C1510", fontFamily: "sans-serif" }}>
                  <strong>{m.emoji} {m.name}</strong>
                  {m.detail && <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.7 }}>{m.detail}</p>}
                  {m.updatedAt && <p style={{ margin: "2px 0 0", fontSize: 10, opacity: 0.5 }}>Mis à jour : {new Date(m.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>}
                </div>
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
