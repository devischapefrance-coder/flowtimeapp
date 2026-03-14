export interface RouteInfo {
  coordinates: [number, number][];
  distance: number; // meters
  duration: number; // seconds
}

export type TransportMode = "foot" | "bike" | "car";

export const TRANSPORT_ICONS: Record<TransportMode, string> = {
  foot: "🚶",
  bike: "🚴",
  car: "🚗",
};

export const TRANSPORT_LABELS: Record<TransportMode, string> = {
  foot: "À pied",
  bike: "Vélo",
  car: "Voiture",
};

const OSRM_PROFILES: Record<TransportMode, string> = {
  foot: "foot",
  bike: "bicycle",
  car: "driving",
};

/** Detect transport mode from GPS speed (m/s). Null defaults to car. */
export function detectTransportMode(speedMs: number | null): TransportMode {
  if (speedMs == null) return "car";
  if (speedMs <= 1.67) return "foot"; // ≤6 km/h
  if (speedMs <= 6.94) return "bike"; // ≤25 km/h
  return "car";
}

/** Fetch route from OSRM (free, no API key) */
export async function fetchRoute(
  from: [number, number],
  to: [number, number],
  mode: TransportMode
): Promise<RouteInfo | null> {
  const profile = OSRM_PROFILES[mode];
  const url = `https://router.project-osrm.org/route/v1/${profile}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]] // GeoJSON [lng,lat] → [lat,lng]
    );
    return {
      coordinates,
      distance: route.distance,
      duration: route.duration,
    };
  } catch {
    return null;
  }
}

/** Format distance in km or m */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

/** Format duration in hours/minutes */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? m.toString().padStart(2, "0") : ""}`;
  return `${m} min`;
}

/** Get ETA as formatted time string ("18h34") */
export function getETA(durationSeconds: number): string {
  const eta = new Date(Date.now() + durationSeconds * 1000);
  return eta.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
}
