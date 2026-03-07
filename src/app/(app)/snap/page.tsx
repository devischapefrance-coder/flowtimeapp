"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import type { MapMarker } from "@/components/MapView";
import { useThemeMapStyle } from "@/components/MapView";
import type { Member, Address, DeviceLocation } from "@/lib/types";
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

interface DeviceWithMember extends DeviceLocation {
  member?: Member;
  avatarUrl?: string;
  transportMode: TransportMode;
}

export default function SnapPage() {
  const { profile } = useProfile();
  const familyId = profile?.family_id;
  const mapStyle = useThemeMapStyle();

  const [devices, setDevices] = useState<DeviceWithMember[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([46.2044, 5.226]);
  const [mapZoom, setMapZoom] = useState(13);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function getAvatarUrl(userId: string): string {
    const { data } = supabase.storage.from("avatars").getPublicUrl(`${userId}/avatar.webp`);
    return data.publicUrl;
  }

  /** Find the "home" address */
  const findHomeAddress = useCallback((): Address | null => {
    const home = addresses.find((a) =>
      a.lat && a.lng && /maison|domicile/i.test(a.name)
    );
    if (home) return home;
    return addresses.find((a) => a.lat && a.lng) || null;
  }, [addresses]);

  /** Load all data */
  const load = useCallback(async () => {
    if (!familyId) return;
    const [devRes, memRes, addrRes] = await Promise.all([
      supabase.from("device_locations").select("*").eq("family_id", familyId),
      supabase.from("members").select("*").eq("family_id", familyId),
      supabase.from("addresses").select("*").eq("family_id", familyId),
    ]);

    const mems = (memRes.data || []) as Member[];
    setMembers(mems);
    setAddresses((addrRes.data || []) as Address[]);

    // Deduplicate devices per user_id
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

    // Center on devices if any
    if (enriched.length > 0) {
      const avgLat = enriched.reduce((s, d) => s + d.lat, 0) / enriched.length;
      const avgLng = enriched.reduce((s, d) => s + d.lng, 0) / enriched.length;
      setMapCenter([avgLat, avgLng]);
    }
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!familyId) return;
    const channel = supabase
      .channel("snap-devices")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "device_locations",
        filter: `family_id=eq.${familyId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId, load]);

  /** Calculate route from selected member to home */
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

  /** Select a member */
  const selectMember = useCallback((userId: string) => {
    if (selectedUserId === userId) {
      // Deselect
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

      // Refresh ETA every 60s
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = setInterval(() => {
        const current = devices.find((d) => d.user_id === userId);
        if (current) calcRoute(current);
      }, 60000);
    }
  }, [selectedUserId, devices, calcRoute]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  // Recalculate route when devices update and someone is selected
  useEffect(() => {
    if (!selectedUserId) return;
    const device = devices.find((d) => d.user_id === selectedUserId);
    if (device) calcRoute(device);
  }, [devices, selectedUserId, calcRoute]);

  const selectedDevice = devices.find((d) => d.user_id === selectedUserId);

  // Build map markers
  const homeAddr = findHomeAddress();
  const mapMarkers: MapMarker[] = [
    ...devices.map((d) => ({
      id: d.id,
      lat: d.lat,
      lng: d.lng,
      emoji: d.member?.emoji || d.emoji,
      name: d.member?.name || d.device_name,
      color: selectedUserId === d.user_id ? "#7C6BF0" : "#3DD6C8",
      type: "member" as const,
      updatedAt: d.updated_at,
      avatarUrl: d.avatarUrl,
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
  ];

  const hasDevices = devices.length > 0;

  return (
    <div className="fixed inset-0" style={{ zIndex: 10 }}>
      {/* Full-screen map */}
      <MapView
        markers={mapMarkers}
        center={mapCenter}
        zoom={mapZoom}
        interactive
        height="100%"
        mapStyle={mapStyle}
        route={route}
        skipFitBounds={!!selectedUserId}
      />

      {/* Back button */}
      <button
        onClick={() => window.history.back()}
        className="fixed top-4 left-4 glass"
        style={{
          zIndex: 20,
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
      {!hasDevices && (
        <div
          className="fixed inset-x-0 bottom-24 flex flex-col items-center gap-3 px-6"
          style={{ zIndex: 20 }}
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

      {/* Bottom member chips */}
      {hasDevices && (
        <div
          className="fixed bottom-20 inset-x-0 flex gap-2 px-3 py-2 overflow-x-auto"
          style={{
            zIndex: 20,
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 8px)",
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {devices.map((d) => {
            const name = d.member?.name || d.device_name;
            const emoji = d.member?.emoji || d.emoji;
            const isSelected = selectedUserId === d.user_id;
            return (
              <button
                key={d.user_id}
                onClick={() => selectMember(d.user_id)}
                className="glass flex items-center gap-2 px-3 py-2 rounded-2xl shrink-0 transition-all"
                style={{
                  border: isSelected ? "2px solid var(--accent)" : "1px solid var(--glass-border)",
                  background: isSelected ? "rgba(124,107,240,0.15)" : undefined,
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
                  <p className="text-[10px]" style={{ color: "var(--dim)" }}>
                    {TRANSPORT_ICONS[d.transportMode]} {TRANSPORT_LABELS[d.transportMode]}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom sheet — selected member route info */}
      {selectedDevice && route && (
        <div
          className="fixed bottom-20 inset-x-0 mx-3 glass rounded-2xl p-4 animate-in"
          style={{
            zIndex: 25,
            marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
            maxWidth: 410,
            left: "50%",
            transform: "translateX(-50%)",
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

          <div className="flex gap-4">
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

          {routeLoading && (
            <p className="text-[10px] text-center mt-2" style={{ color: "var(--dim)" }}>
              Mise à jour...
            </p>
          )}
        </div>
      )}

      {/* Loading state for route */}
      {selectedUserId && !route && routeLoading && (
        <div
          className="fixed bottom-20 inset-x-0 mx-3 glass rounded-2xl p-4 text-center animate-in"
          style={{
            zIndex: 25,
            marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
            maxWidth: 410,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--dim)" }}>Calcul de l&apos;itinéraire...</p>
        </div>
      )}

      {/* No home address warning */}
      {selectedUserId && !route && !routeLoading && (
        <div
          className="fixed bottom-20 inset-x-0 mx-3 glass rounded-2xl p-4 text-center animate-in"
          style={{
            zIndex: 25,
            marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 60px)",
            maxWidth: 410,
            left: "50%",
            transform: "translateX(-50%)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--dim)" }}>
            {!homeAddr
              ? "Ajoutez une adresse \"Maison\" dans Famille pour voir l'itinéraire."
              : "Impossible de calculer l'itinéraire."}
          </p>
        </div>
      )}
    </div>
  );
}
