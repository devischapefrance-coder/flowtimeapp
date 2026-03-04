"use client";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useMemo } from "react";

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
        <span style="position:absolute;width:40px;height:40px;border-radius:50%;background:rgba(0,122,255,0.15);animation:pulse 2s infinite"></span>
        <span style="width:14px;height:14px;border-radius:50%;background:#007AFF;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.3);position:relative;z-index:1"></span>
      </div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
  }

  // Apple-style capsule pin for members/devices
  if (marker.type === "member" || marker.type === "device") {
    const color = marker.color || "#5ED4C8";
    const pulseRing = marker.type === "device"
      ? `<span style="position:absolute;width:44px;height:44px;border-radius:50%;background:${color}20;animation:pulse 2s infinite;top:-6px;left:-6px"></span>`
      : "";
    return L.divIcon({
      className: "",
      html: `<div style="position:relative;display:flex;flex-direction:column;align-items:center">
        ${pulseRing}
        <div style="
          background:#fff;
          border-radius:16px;
          padding:4px 8px;
          display:flex;align-items:center;gap:4px;
          box-shadow:0 2px 12px rgba(0,0,0,0.15),0 1px 3px rgba(0,0,0,0.1);
          position:relative;z-index:1;
          border:1px solid rgba(0,0,0,0.06);
        ">
          <span style="font-size:16px;line-height:1">${marker.emoji}</span>
          <span style="font-size:10px;font-weight:600;color:#1D1D1F;white-space:nowrap;max-width:60px;overflow:hidden;text-overflow:ellipsis">${marker.name.split(" ")[0]}</span>
          <span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0"></span>
        </div>
        <div style="width:2px;height:6px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.1);position:relative;z-index:1"></div>
        <div style="width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.2);position:relative;z-index:1"></div>
      </div>`,
      iconSize: [32, 52],
      iconAnchor: [16, 52],
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
      <div style="width:6px;height:6px;border-radius:50%;background:#FF3B30;box-shadow:0 1px 4px rgba(0,0,0,0.2)"></div>
    </div>`,
    iconSize: [40, 50],
    iconAnchor: [20, 50],
  });
}

function FitBounds({ markers }: { markers: MapMarker[] }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length > 1) {
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

export default function MapView({
  markers,
  center = [46.2044, 5.226],
  interactive = false,
  height = "200px",
  onMapClick,
  zoom = 12,
  mapStyle = "apple",
  route,
  onMarkerDragEnd,
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
        style={{ height: "100%", width: "100%", background: mapStyle === "dark" ? "#0F1117" : "#F5F5F7" }}
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
        {/* Route border (wider, darker) */}
        {route && route.coordinates.length > 1 && (
          <Polyline
            positions={route.coordinates}
            pathOptions={{ color: "#2563EB", weight: 8, opacity: 0.3, lineCap: "round", lineJoin: "round" }}
          />
        )}
        {/* Route line */}
        {route && route.coordinates.length > 1 && (
          <Polyline
            positions={route.coordinates}
            pathOptions={{ color: "#007AFF", weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }}
          />
        )}
        {markers.map((m, i) => (
          m.draggable && onMarkerDragEnd ? (
            <DraggableMarker
              key={`${m.id || i}-drag`}
              m={m}
              icon={createIcon(m)}
              interactive={interactive}
              onDragEnd={onMarkerDragEnd}
            />
          ) : (
            <Marker key={`${m.lat}-${m.lng}-${i}`} position={[m.lat, m.lng]} icon={createIcon(m)}>
              {interactive && (
                <Popup>
                  <div style={{ color: "#1D1D1F", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", padding: "2px 0" }}>
                    <strong style={{ fontSize: 13 }}>{m.emoji} {m.name}</strong>
                    {m.detail && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#86868B" }}>{m.detail}</p>}
                    {m.updatedAt && <p style={{ margin: "2px 0 0", fontSize: 10, color: "#AEAEB2" }}>Mis a jour : {new Date(m.updatedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</p>}
                  </div>
                </Popup>
              )}
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );
}
