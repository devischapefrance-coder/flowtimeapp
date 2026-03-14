"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import type { MapMarker, SafeZoneConfig } from "@/components/MapView";
import { useThemeMapStyle } from "@/components/MapView";
import type { Member, Address, DeviceLocation, POI, GeofenceAlert } from "@/lib/types";
import {
  fetchRoute,
  detectTransportMode,
  formatDistance,
  formatDuration,
  getETA,
  TRANSPORT_ICONS,
  TRANSPORT_LABELS,
  type RouteInfo,
  type TransportMode,
} from "@/lib/routing";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`;
  return `il y a ${Math.floor(diff / 86400)}j`;
}

function getCSSColor(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback;
}

/** Distance en mètres entre deux points GPS (Haversine) */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface DeviceWithMember extends DeviceLocation {
  member?: Member;
  avatarUrl?: string;
  transportMode: TransportMode;
}

interface MemberETA {
  userId: string;
  etaMinutes: number;
  distance: number;
  duration: number;
}

export default function FlowMapPage() {
  const { profile } = useProfile();
  const familyId = profile?.family_id;
  const mapStyle = useThemeMapStyle();

  const [devices, setDevices] = useState<DeviceWithMember[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [pois, setPois] = useState<POI[]>([]);
  const [geofenceAlerts, setGeofenceAlerts] = useState<GeofenceAlert[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.2044, 5.226]);
  const [mapZoom, setMapZoom] = useState(13);
  const [dataReady, setDataReady] = useState(false);
  const [memberETAs, setMemberETAs] = useState<Record<string, MemberETA>>({});
  const [showAddPOI, setShowAddPOI] = useState<{ lat: number; lng: number } | null>(null);
  const [poiName, setPoiName] = useState("");
  const [poiEmoji, setPoiEmoji] = useState("📍");
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  function getAvatarUrl(userId: string): string {
    const { data } = supabase.storage.from("avatars").getPublicUrl(`${userId}/avatar.webp`);
    return data.publicUrl;
  }

  const findHomeAddress = useCallback((): Address | null => {
    const home = addresses.find((a) =>
      a.lat && a.lng && /maison|domicile/i.test(a.name)
    );
    if (home) return home;
    return addresses.find((a) => a.lat && a.lng) || null;
  }, [addresses]);

  // Charger les données
  const load = useCallback(async () => {
    if (!familyId) return;
    const [devRes, memRes, addrRes, poiRes, geoRes] = await Promise.all([
      supabase.from("device_locations").select("*").eq("family_id", familyId),
      supabase.from("members").select("*").eq("family_id", familyId),
      supabase.from("addresses").select("*").eq("family_id", familyId),
      supabase.from("pois").select("*").eq("family_id", familyId),
      supabase.from("geofence_alerts").select("*").eq("family_id", familyId).eq("enabled", true),
    ]);

    const mems = (memRes.data || []) as Member[];
    setAddresses((addrRes.data || []) as Address[]);
    setPois((poiRes.data || []) as POI[]);
    setGeofenceAlerts((geoRes.data || []) as GeofenceAlert[]);

    const raw = (devRes.data || []) as DeviceLocation[];
    const unique = Object.values(
      raw.reduce<Record<string, DeviceLocation>>((acc, d) => {
        if (!acc[d.user_id] || new Date(d.updated_at) > new Date(acc[d.user_id].updated_at)) {
          acc[d.user_id] = d;
        }
        return acc;
      }, {})
    );

    const enriched: DeviceWithMember[] = unique.map((d) => {
      const member = mems.find((m) => m.user_id === d.user_id);
      return {
        ...d,
        member,
        avatarUrl: d.user_id ? getAvatarUrl(d.user_id) : undefined,
        transportMode: detectTransportMode(d.speed),
      };
    });
    setDevices(enriched);

    if (enriched.length > 0) {
      const avgLat = enriched.reduce((s, d) => s + d.lat, 0) / enriched.length;
      const avgLng = enriched.reduce((s, d) => s + d.lng, 0) / enriched.length;
      setMapCenter([avgLat, avgLng]);
      if (enriched.length === 1) setMapZoom(15);
    }
    setDataReady(true);
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!familyId) return;
    const channel = supabase
      .channel("flowmap-devices")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "device_locations",
        filter: `family_id=eq.${familyId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId, load]);

  // Calculer ETA pour tous les membres vers maison
  useEffect(() => {
    if (devices.length === 0) return;
    const home = findHomeAddress();
    if (!home?.lat || !home?.lng) return;

    const calcAll = async () => {
      const results: Record<string, MemberETA> = {};
      await Promise.all(
        devices.map(async (d) => {
          const result = await fetchRoute(
            [d.lat, d.lng],
            [home.lat!, home.lng!],
            d.transportMode
          );
          if (result) {
            results[d.user_id] = {
              userId: d.user_id,
              etaMinutes: Math.round(result.duration / 60),
              distance: result.distance,
              duration: result.duration,
            };
          }
        })
      );
      setMemberETAs(results);
    };
    calcAll();
  }, [devices, findHomeAddress]);

  // Détection géofence — vérifier positions vs zones d'alerte
  useEffect(() => {
    if (devices.length === 0 || geofenceAlerts.length === 0 || pois.length === 0) return;

    geofenceAlerts.forEach(async (alert) => {
      const poi = pois.find((p) => p.id === alert.poi_id);
      const device = devices.find((d) => {
        const member = d.member;
        return member && member.id === alert.member_id;
      });
      if (!poi || !device) return;

      const distance = haversineDistance(device.lat, device.lng, poi.lat, poi.lng);
      const isInside = distance <= alert.radius;
      const newState = isInside ? "inside" : "outside";

      // Transition détectée
      if (alert.last_state && alert.last_state !== newState) {
        const shouldAlert =
          alert.alert_type === "both" ||
          (alert.alert_type === "enter" && newState === "inside") ||
          (alert.alert_type === "exit" && newState === "outside");

        if (shouldAlert) {
          const memberName = device.member?.name || "Un membre";
          const action = newState === "inside" ? "est arrivé à" : "a quitté";
          // Notification navigateur
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Alerte zone", {
              body: `${memberName} ${action} ${poi.name}`,
              icon: "/icons/icon-192.png",
            });
          }
        }
      }

      // Mettre à jour l'état
      if (alert.last_state !== newState) {
        await supabase
          .from("geofence_alerts")
          .update({ last_state: newState, last_triggered_at: new Date().toISOString() })
          .eq("id", alert.id);
      }
    });
  }, [devices, geofenceAlerts, pois]);

  const calcRoute = useCallback(async (device: DeviceWithMember) => {
    const home = findHomeAddress();
    if (!home?.lat || !home?.lng) return;
    setRouteLoading(true);
    const result = await fetchRoute(
      [device.lat, device.lng],
      [home.lat, home.lng],
      device.transportMode
    );
    setRoute(result);
    setRouteLoading(false);
  }, [findHomeAddress]);

  const selectMember = useCallback((userId: string) => {
    if (selectedUserId === userId) {
      setSelectedUserId(null);
      setRoute(null);
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      return;
    }
    setSelectedUserId(userId);
    setRoute(null);
    const device = devices.find((d) => d.user_id === userId);
    if (device) {
      setMapCenter([device.lat, device.lng]);
      setMapZoom(15);
      calcRoute(device);
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = setInterval(() => {
        const current = devices.find((d) => d.user_id === userId);
        if (current) calcRoute(current);
      }, 60000);
    }
  }, [selectedUserId, devices, calcRoute]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedUserId) return;
    const device = devices.find((d) => d.user_id === selectedUserId);
    if (device) calcRoute(device);
  }, [devices, selectedUserId, calcRoute]);

  // Ajouter un POI (long press)
  const handleLongPress = useCallback((lat: number, lng: number) => {
    setShowAddPOI({ lat, lng });
    setPoiName("");
    setPoiEmoji("📍");
  }, []);

  const savePOI = useCallback(async () => {
    if (!showAddPOI || !poiName.trim() || !familyId || !profile) return;

    // Reverse geocode pour l'adresse
    let address = "";
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${showAddPOI.lat}&lon=${showAddPOI.lng}&zoom=18`,
        { headers: { "User-Agent": "FlowTime/1.0" } }
      );
      const data = await res.json();
      address = data.display_name?.split(",").slice(0, 3).join(",").trim() || "";
    } catch { /* ignore */ }

    await supabase.from("pois").insert({
      family_id: familyId,
      name: poiName.trim(),
      emoji: poiEmoji,
      lat: showAddPOI.lat,
      lng: showAddPOI.lng,
      address,
      created_by: profile.id,
    });

    setShowAddPOI(null);
    load();
  }, [showAddPOI, poiName, poiEmoji, familyId, profile, load]);

  const selectedDevice = devices.find((d) => d.user_id === selectedUserId);
  const homeAddr = findHomeAddress();

  // Couleurs résolues pour Leaflet
  const accentColor = getCSSColor("--accent", "#7C6BF0");
  const tealColor = getCSSColor("--teal", "#5ED4C8");

  const mapMarkers: MapMarker[] = [
    ...devices.map((d) => ({
      id: d.id,
      lat: d.lat,
      lng: d.lng,
      emoji: d.member?.emoji || d.emoji,
      name: d.member?.name || d.device_name,
      color: selectedUserId === d.user_id ? accentColor : tealColor,
      type: "member" as const,
      updatedAt: d.updated_at,
      avatarUrl: d.avatarUrl,
      // ETA affiché uniquement dans la barre membres, pas sur les markers
    })),
    ...(homeAddr?.lat && homeAddr?.lng
      ? [{
          id: homeAddr.id,
          lat: homeAddr.lat,
          lng: homeAddr.lng,
          emoji: homeAddr.emoji || "🏠",
          name: homeAddr.name,
          type: "address" as const,
        }]
      : []),
    ...pois.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      emoji: p.emoji,
      name: p.name,
      detail: p.address,
      type: "poi" as const,
    })),
  ];

  // Config zone de sécurité
  const safeZone: SafeZoneConfig | null =
    homeAddr?.lat && homeAddr?.lng && profile?.show_safe_zone
      ? {
          center: [homeAddr.lat, homeAddr.lng],
          radius: profile.safe_radius ?? 500,
          visible: true,
        }
      : null;

  const hasDevices = devices.length > 0;
  const mapHeight = "calc(100dvh - 80px)";

  const POI_EMOJIS = ["📍", "⭐", "🏠", "🏢", "🏫", "🏥", "🛒", "⚽", "🌳", "🍽️", "☕", "🎬"];

  return (
    <div
      ref={mapContainerRef}
      style={{
        marginTop: "calc(-1 * env(safe-area-inset-top, 0px))",
        marginBottom: -80,
        height: mapHeight,
        position: "relative",
      }}
    >
      {/* Map */}
      {dataReady && (
        <MapView
          markers={mapMarkers}
          center={mapCenter}
          zoom={mapZoom}
          interactive
          height={mapHeight}
          mapStyle={mapStyle}
          route={route}
          skipFitBounds={!!selectedUserId}
          safeZone={safeZone}
          onLongPress={handleLongPress}
        />
      )}

      {/* Bouton retour */}
      <button
        onClick={() => window.history.back()}
        className="glass"
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 1000,
          width: 40,
          height: 40,
          borderRadius: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          marginTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        ←
      </button>

      {/* Empty state */}
      {!hasDevices && dataReady && (
        <div
          style={{ position: "absolute", bottom: 24, left: 0, right: 0, zIndex: 1000, padding: "0 24px" }}
          className="flex flex-col items-center"
        >
          <div className="glass p-6 rounded-2xl text-center w-full" style={{ maxWidth: 380 }}>
            <p className="text-3xl mb-2">📍</p>
            <p className="font-semibold mb-1">Aucun membre ne partage sa position</p>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              Activez le partage de position dans l&apos;onglet Famille pour voir vos proches sur la carte.
            </p>
            <a
              href="/famille"
              className="inline-block mt-4 px-5 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              Aller à Famille
            </a>
          </div>
        </div>
      )}

      {/* Barre des membres enrichie */}
      {hasDevices && !selectedDevice && (
        <div
          className="flex gap-2 overflow-x-auto"
          style={{
            position: "absolute",
            bottom: 8,
            left: 0,
            right: 0,
            zIndex: 1000,
            padding: "8px 12px",
            scrollbarWidth: "none",
          }}
        >
          {devices.map((d) => {
            const name = d.member?.name || d.device_name;
            const emoji = d.member?.emoji || d.emoji;
            const isSelected = selectedUserId === d.user_id;
            const eta = memberETAs[d.user_id];
            const speedKmh = d.speed != null ? Math.round(d.speed * 3.6) : null;
            const isStale = d.updated_at ? (Date.now() - new Date(d.updated_at).getTime()) > 30 * 60 * 1000 : false;
            return (
              <button
                key={d.user_id}
                onClick={() => selectMember(d.user_id)}
                className="glass flex items-center gap-2 px-3 py-2 rounded-2xl shrink-0 transition-all"
                style={{
                  border: isSelected ? "2px solid var(--accent)" : "1px solid var(--glass-border)",
                  background: isSelected ? "rgba(124,107,240,0.15)" : undefined,
                  opacity: isStale ? 0.5 : 1,
                }}
              >
                {d.avatarUrl ? (
                  <img
                    src={d.avatarUrl}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).nextElementSibling!.removeAttribute("style");
                    }}
                  />
                ) : null}
                <span
                  className="text-lg"
                  style={d.avatarUrl ? { display: "none" } : undefined}
                >
                  {emoji}
                </span>
                <div className="text-left">
                  <p className="text-xs font-semibold leading-tight">{name.split(" ")[0]}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px]" style={{ color: "var(--dim)" }}>
                      {TRANSPORT_ICONS[d.transportMode]}
                    </span>
                    {speedKmh != null && speedKmh > 0 && (
                      <span className="text-[10px] font-medium" style={{ color: "var(--dim)" }}>
                        {speedKmh} km/h
                      </span>
                    )}
                    {eta && (
                      <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                        🏠 {eta.etaMinutes} min
                      </span>
                    )}
                  </div>
                  <p className="text-[9px]" style={{ color: "var(--faint)" }}>
                    {formatTimeAgo(d.updated_at)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom sheet — infos itinéraire du membre sélectionné */}
      {selectedDevice && route && (
        <div
          className="glass rounded-2xl p-4 animate-in"
          style={{
            position: "absolute",
            bottom: 8,
            left: 12,
            right: 12,
            zIndex: 1000,
            maxWidth: 410,
            margin: "0 auto",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">
                {TRANSPORT_ICONS[selectedDevice.transportMode]}
              </span>
              <div>
                <p className="font-semibold text-sm">
                  {selectedDevice.member?.name || selectedDevice.device_name}
                </p>
                <p className="text-xs" style={{ color: "var(--dim)" }}>
                  {TRANSPORT_LABELS[selectedDevice.transportMode]} vers {homeAddr?.name || "Maison"}
                </p>
              </div>
            </div>
            <button
              onClick={() => { setSelectedUserId(null); setRoute(null); }}
              className="text-lg opacity-50 hover:opacity-100"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-4 mb-3">
            <div className="flex-1 text-center glass rounded-xl p-2">
              <p className="text-lg font-bold">{formatDistance(route.distance)}</p>
              <p className="text-[10px]" style={{ color: "var(--dim)" }}>Distance</p>
            </div>
            <div className="flex-1 text-center glass rounded-xl p-2">
              <p className="text-lg font-bold">{formatDuration(route.duration)}</p>
              <p className="text-[10px]" style={{ color: "var(--dim)" }}>Durée</p>
            </div>
            <div className="flex-1 text-center glass rounded-xl p-2">
              <p className="text-lg font-bold">{getETA(route.duration)}</p>
              <p className="text-[10px]" style={{ color: "var(--dim)" }}>Arrivée</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[10px]" style={{ color: "var(--dim)" }}>
              {routeLoading ? "Mise à jour..." : `Actualisé ${formatTimeAgo(selectedDevice.updated_at)}`}
            </p>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
              style={{ background: "var(--accent)", color: "#fff" }}
              onClick={() => {
                const lat = selectedDevice.lat;
                const lng = selectedDevice.lng;
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                if (isIOS) {
                  window.open(`maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`, "_blank");
                } else {
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, "_blank");
                }
              }}
            >
              🧭 Naviguer
            </button>
          </div>
        </div>
      )}

      {/* Loading route */}
      {selectedUserId && !route && routeLoading && (
        <div
          className="glass rounded-2xl p-4 text-center animate-in"
          style={{
            position: "absolute",
            bottom: 8,
            left: 12,
            right: 12,
            zIndex: 1000,
            maxWidth: 410,
            margin: "0 auto",
          }}
        >
          <p className="text-sm" style={{ color: "var(--dim)" }}>Calcul de l&apos;itinéraire...</p>
        </div>
      )}

      {/* Pas d'adresse maison */}
      {selectedUserId && !route && !routeLoading && (
        <div
          className="glass rounded-2xl p-4 text-center animate-in"
          style={{
            position: "absolute",
            bottom: 8,
            left: 12,
            right: 12,
            zIndex: 1000,
            maxWidth: 410,
            margin: "0 auto",
          }}
        >
          <p className="text-sm" style={{ color: "var(--dim)" }}>
            {!homeAddr
              ? "Ajoutez une adresse \"Maison\" dans Famille pour voir l'itinéraire."
              : "Impossible de calculer l'itinéraire."}
          </p>
        </div>
      )}

      {/* Modal ajout POI (long press) */}
      {showAddPOI && (
        <div
          className="fixed inset-0 flex items-end justify-center"
          style={{ zIndex: 2000, background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddPOI(null); }}
        >
          <div
            className="glass rounded-t-2xl p-5 w-full animate-in"
            style={{ maxWidth: 430, paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}
          >
            <h3 className="font-bold text-base mb-4">Nouveau point d&apos;intérêt</h3>

            {/* Choix emoji */}
            <div className="flex flex-wrap gap-2 mb-4">
              {POI_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setPoiEmoji(e)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all"
                  style={{
                    background: poiEmoji === e ? "var(--accent)" : "var(--surface)",
                    border: poiEmoji === e ? "2px solid var(--accent)" : "1px solid var(--glass-border)",
                  }}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* Nom */}
            <input
              type="text"
              placeholder="Nom du lieu..."
              value={poiName}
              onChange={(e) => setPoiName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm mb-4"
              style={{
                background: "var(--surface2)",
                color: "var(--text)",
                border: "1px solid var(--glass-border)",
                outline: "none",
              }}
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowAddPOI(null)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "var(--surface)", color: "var(--text)" }}
              >
                Annuler
              </button>
              <button
                onClick={savePOI}
                disabled={!poiName.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-bold"
                style={{
                  background: poiName.trim() ? "var(--accent)" : "var(--surface2)",
                  color: poiName.trim() ? "#fff" : "var(--dim)",
                }}
              >
                {poiEmoji} Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
