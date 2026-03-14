"use client";

import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

// Disable tap handler globally for iOS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(L.Map as any).mergeOptions({ tap: false });

interface AddressPickerMapProps {
  lat: number | null;
  lng: number | null;
  emoji?: string;
  onPositionChange: (lat: number, lng: number) => void;
}

function createPinIcon(emoji: string) {
  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    html: `<div style="
      width:36px;height:36px;display:flex;align-items:center;justify-content:center;
      background:#fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);
      font-size:18px;border:2px solid var(--accent);
    ">${emoji}</div>`,
  });
}

function ClickHandler({ onPositionChange }: { onPositionChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPositionChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function DraggablePin({ lat, lng, emoji, onPositionChange }: { lat: number; lng: number; emoji: string; onPositionChange: (lat: number, lng: number) => void }) {
  const markerRef = useRef<L.Marker>(null);
  const icon = createPinIcon(emoji);

  return (
    <Marker
      ref={markerRef}
      position={[lat, lng]}
      icon={icon}
      draggable
      eventHandlers={{
        dragend() {
          const mk = markerRef.current;
          if (mk) {
            const pos = mk.getLatLng();
            onPositionChange(pos.lat, pos.lng);
          }
        },
      }}
    />
  );
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const prevKey = useRef("");
  useEffect(() => {
    const key = `${lat},${lng}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    map.flyTo([lat, lng], 17, { duration: 0.5 });
  }, [map, lat, lng]);
  return null;
}

export default function AddressPickerMap({ lat, lng, emoji = "📍", onPositionChange }: AddressPickerMapProps) {
  const hasPosition = lat != null && lng != null && lat !== 0 && lng !== 0;
  const centerLat = hasPosition ? lat! : 46.6;
  const centerLng = hasPosition ? lng! : 2.5;

  return (
    <div style={{ height: 200, borderRadius: 16, overflow: "hidden" }}>
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={hasPosition ? 17 : 6}
        style={{ height: "100%", width: "100%", background: "var(--bg)" }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <ClickHandler onPositionChange={onPositionChange} />
        {hasPosition && (
          <>
            <DraggablePin lat={lat!} lng={lng!} emoji={emoji} onPositionChange={onPositionChange} />
            <RecenterMap lat={lat!} lng={lng!} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
