"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface MapMarker {
  lat: number;
  lng: number;
  emoji: string;
  name: string;
  color?: string;
  type: "member" | "address";
}

interface MapViewProps {
  markers: MapMarker[];
  center?: [number, number];
  interactive?: boolean;
  height?: string;
  onMapClick?: () => void;
}

function createIcon(marker: MapMarker) {
  if (marker.type === "member") {
    return L.divIcon({
      className: "",
      html: `<div style="display:flex;flex-direction:column;align-items:center">
        <span style="font-size:22px">${marker.emoji}</span>
        <span style="width:8px;height:8px;border-radius:50%;background:${marker.color || "var(--teal)"};display:block;margin-top:2px"></span>
      </div>`,
      iconSize: [30, 36],
      iconAnchor: [15, 36],
    });
  }
  return L.divIcon({
    className: "",
    html: `<div style="background:var(--surface2);border-radius:8px;padding:4px 6px;font-size:18px;border:1px solid rgba(255,255,255,0.1)">${marker.emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

export default function MapView({
  markers,
  center = [46.2044, 5.226],
  interactive = false,
  height = "200px",
  onMapClick,
}: MapViewProps) {
  return (
    <div
      style={{ height, borderRadius: 16, overflow: "hidden", cursor: onMapClick ? "pointer" : "default" }}
      onClick={onMapClick}
    >
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: "100%", width: "100%" }}
        dragging={interactive}
        zoomControl={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {markers.map((m, i) => (
          <Marker key={i} position={[m.lat, m.lng]} icon={createIcon(m)}>
            {interactive && <Popup>{m.name}</Popup>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
