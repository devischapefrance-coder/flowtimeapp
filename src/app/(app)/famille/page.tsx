"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import Modal from "@/components/Modal";
import type { Member, Contact, Address } from "@/lib/types";

const MapViewDynamic = dynamic(() => import("@/components/MapView"), { ssr: false });
const MapFullDynamic = dynamic(() => import("@/components/MapFull"), { ssr: false });

const MEMBER_EMOJIS = ["⚽","🎨","🎵","🎮","📚","🏊","🎭","🎤","💃","🎯","🏀","🎸","🐱","🐶","🦋","🌟","💪","🎪","🎲","🎳"];
const MEMBER_COLORS = ["#3DD6C8","#FF8C42","#FFD166","#FF6B6B","#6BCB77","#B39DDB","#64B5F6","#F48FB1"];
const ROLES = ["parent","enfant","bébé","ado","grand-parent","autre"];
const ADDRESS_EMOJIS = ["🏠","🏫","💼","⚽","🏥","👶","👴","🏪","🎭","🏖️"];
const CONTACT_RELATIONS = ["nounou","voisin","médecin","école","urgence","famille","autre"];
const DEFAULT_ADDRESSES = [
  { name: "Maison", emoji: "🏠" },
  { name: "École", emoji: "🏫" },
  { name: "Travail", emoji: "💼" },
  { name: "Sport", emoji: "⚽" },
  { name: "Médecin", emoji: "🏥" },
  { name: "Crèche", emoji: "👶" },
  { name: "Grands-parents", emoji: "👴" },
];

export default function FamillePage() {
  const { profile } = useProfile();
  const familyId = profile?.family_id;

  const [members, setMembers] = useState<Member[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [mapFull, setMapFull] = useState(false);

  // Modal states
  const [memberModal, setMemberModal] = useState<Member | null | "new">(null);
  const [contactModal, setContactModal] = useState<Contact | null | "new">(null);
  const [addressModal, setAddressModal] = useState<Address | null | "new">(null);

  // Form states
  const [form, setForm] = useState<Record<string, string | string[]>>({});
  const [nominatimResults, setNominatimResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    if (!familyId) return;
    const [m, c, a] = await Promise.all([
      supabase.from("members").select("*").eq("family_id", familyId),
      supabase.from("contacts").select("*").eq("family_id", familyId),
      supabase.from("addresses").select("*").eq("family_id", familyId),
    ]);
    if (m.data) setMembers(m.data as Member[]);
    if (c.data) setContacts(c.data as Contact[]);
    if (a.data) setAddresses(a.data as Address[]);
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  // Suggest default addresses if none exist
  useEffect(() => {
    if (familyId && addresses.length === 0 && members.length >= 0) {
      // Only suggest once - check is handled by the empty state UI
    }
  }, [familyId, addresses.length, members.length]);

  async function createDefaultAddresses() {
    if (!familyId) return;
    const inserts = DEFAULT_ADDRESSES.map((a) => ({
      family_id: familyId,
      name: a.name,
      emoji: a.emoji,
      address: "",
      members: [],
    }));
    await supabase.from("addresses").insert(inserts);
    load();
  }

  // Nominatim search
  useEffect(() => {
    if (searchQuery.length < 3) { setNominatimResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=fr&limit=5`,
          { headers: { "User-Agent": "FlowTime/1.0" } }
        );
        const data = await res.json();
        setNominatimResults(data);
      } catch { setNominatimResults([]); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // MEMBER CRUD
  function openMemberModal(m: Member | "new") {
    if (m === "new") {
      setForm({ name: "", role: "enfant", emoji: "👦", color: "#3DD6C8" });
    } else {
      setForm({ name: m.name, role: m.role, emoji: m.emoji, color: m.color });
    }
    setMemberModal(m);
  }

  async function saveMember() {
    if (!familyId) return;
    const data = { family_id: familyId, name: form.name as string, role: form.role as string, emoji: form.emoji as string, color: form.color as string };
    if (memberModal === "new") {
      await supabase.from("members").insert(data);
    } else if (memberModal) {
      await supabase.from("members").update(data).eq("id", memberModal.id);
    }
    setMemberModal(null);
    load();
  }

  async function deleteMember() {
    if (memberModal && memberModal !== "new" && confirm("Supprimer ce membre ?")) {
      await supabase.from("members").delete().eq("id", memberModal.id);
      setMemberModal(null);
      load();
    }
  }

  // CONTACT CRUD
  function openContactModal(c: Contact | "new") {
    if (c === "new") {
      setForm({ name: "", phone: "", relation: "famille", emoji: "👤" });
    } else {
      setForm({ name: c.name, phone: c.phone, relation: c.relation, emoji: c.emoji });
    }
    setContactModal(c);
  }

  async function saveContact() {
    if (!familyId) return;
    const data = { family_id: familyId, name: form.name as string, phone: form.phone as string, relation: form.relation as string, emoji: form.emoji as string };
    if (contactModal === "new") {
      await supabase.from("contacts").insert(data);
    } else if (contactModal) {
      await supabase.from("contacts").update(data).eq("id", contactModal.id);
    }
    setContactModal(null);
    load();
  }

  async function deleteContact() {
    if (contactModal && contactModal !== "new" && confirm("Supprimer ce contact ?")) {
      await supabase.from("contacts").delete().eq("id", contactModal.id);
      setContactModal(null);
      load();
    }
  }

  // ADDRESS CRUD
  function openAddressModal(a: Address | "new") {
    if (a === "new") {
      setForm({ name: "", emoji: "📍", address: "", lat: "", lng: "", members: [] });
    } else {
      setForm({
        name: a.name,
        emoji: a.emoji,
        address: a.address,
        lat: a.lat?.toString() || "",
        lng: a.lng?.toString() || "",
        members: (a.members || []) as string[],
      });
    }
    setSearchQuery("");
    setNominatimResults([]);
    setAddressModal(a);
  }

  async function saveAddress() {
    if (!familyId) return;
    const data = {
      family_id: familyId,
      name: form.name as string,
      emoji: form.emoji as string,
      address: form.address as string,
      lat: form.lat ? parseFloat(form.lat as string) : null,
      lng: form.lng ? parseFloat(form.lng as string) : null,
      members: form.members || [],
    };
    if (addressModal === "new") {
      await supabase.from("addresses").insert(data);
    } else if (addressModal) {
      await supabase.from("addresses").update(data).eq("id", (addressModal as Address).id);
    }
    setAddressModal(null);
    load();
  }

  async function deleteAddress() {
    if (addressModal && addressModal !== "new" && confirm("Supprimer cette adresse ?")) {
      await supabase.from("addresses").delete().eq("id", (addressModal as Address).id);
      setAddressModal(null);
      load();
    }
  }

  // Map markers
  const mapMarkers = addresses
    .filter((a) => a.lat && a.lng)
    .map((a) => ({
      lat: a.lat!,
      lng: a.lng!,
      emoji: a.emoji,
      name: a.name,
      type: "address" as const,
    }));

  const mapCenter: [number, number] = profile?.lat && profile?.lng
    ? [profile.lat, profile.lng]
    : mapMarkers.length > 0
      ? [mapMarkers[0].lat, mapMarkers[0].lng]
      : [46.2044, 5.226];

  const filledAddresses = addresses.filter((a) => a.address).length;

  return (
    <div className="px-4 py-4 animate-in">
      <h1 className="text-xl font-extrabold mb-6">Famille</h1>

      {/* MEMBRES */}
      <p className="label">Membres de la famille</p>
      {members.map((m) => (
        <div key={m.id} className="card flex items-center gap-3 cursor-pointer" onClick={() => openMemberModal(m)}>
          <div className="w-10 h-10 flex items-center justify-center rounded-full text-xl" style={{ background: "var(--surface2)" }}>{m.emoji}</div>
          <div className="flex-1">
            <p className="font-bold text-sm">{m.name}</p>
            <p className="text-xs" style={{ color: "var(--dim)" }}>{m.role}</p>
          </div>
          <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
        </div>
      ))}
      <button className="btn btn-secondary mt-1 mb-6" onClick={() => openMemberModal("new")}>＋ Ajouter un membre</button>

      {/* CONTACTS */}
      <p className="label">Contacts de confiance</p>
      {contacts.map((c) => (
        <div key={c.id} className="card flex items-center gap-3 cursor-pointer" onClick={() => openContactModal(c)}>
          <div className="w-10 h-10 flex items-center justify-center rounded-full text-xl" style={{ background: "var(--surface2)" }}>{c.emoji}</div>
          <div className="flex-1">
            <p className="font-bold text-sm">{c.name}</p>
            <p className="text-xs" style={{ color: "var(--dim)" }}>{c.relation} · {c.phone}</p>
          </div>
        </div>
      ))}
      <button className="btn btn-secondary mt-1 mb-6" onClick={() => openContactModal("new")}>＋ Ajouter un contact</button>

      {/* ADRESSES */}
      <p className="label">Mes adresses</p>
      {addresses.length > 0 && (
        <div className="mb-3">
          <p className="text-xs mb-1" style={{ color: "var(--dim)" }}>{filledAddresses}/{addresses.length} adresses remplies</p>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(filledAddresses / addresses.length) * 100}%`,
                background: filledAddresses === addresses.length ? "var(--green)" : filledAddresses >= addresses.length / 2 ? "var(--warm)" : "var(--red)",
              }}
            />
          </div>
        </div>
      )}
      {addresses.length === 0 && (
        <button className="btn btn-secondary mb-3" onClick={createDefaultAddresses}>
          Ajouter les adresses suggérées
        </button>
      )}
      {addresses.map((a) => (
        <div
          key={a.id}
          className="card flex items-center gap-3 cursor-pointer"
          onClick={() => openAddressModal(a)}
          style={{ borderLeft: `3px solid ${a.address ? "var(--green)" : "var(--red)"}` }}
        >
          <div className="text-xl">{a.emoji}</div>
          <div className="flex-1">
            <p className="font-bold text-sm">{a.name}</p>
            <p className="text-xs" style={{ color: a.address ? "var(--dim)" : "var(--red)" }}>
              {a.address || "⚠️ Adresse manquante"}
            </p>
            {a.members && (a.members as string[]).length > 0 && (
              <div className="flex gap-1 mt-1">
                {(a.members as string[]).map((mid) => {
                  const mem = members.find((m) => m.id === mid);
                  return mem ? <span key={mid} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "var(--surface2)" }}>{mem.emoji}</span> : null;
                })}
              </div>
            )}
          </div>
        </div>
      ))}
      <button className="btn btn-secondary mt-1 mb-6" onClick={() => openAddressModal("new")}>＋ Ajouter une adresse</button>

      {/* MINI CARTE */}
      {mapMarkers.length > 0 && (
        <div className="mb-4">
          <p className="label">Carte</p>
          <MapViewDynamic
            markers={mapMarkers}
            center={mapCenter}
            height="200px"
            onMapClick={() => setMapFull(true)}
          />
        </div>
      )}

      {/* CARTE PLEIN ECRAN */}
      {mapFull && (
        <MapFullDynamic
          markers={mapMarkers}
          center={mapCenter}
          onClose={() => setMapFull(false)}
        />
      )}

      {/* MODAL MEMBRE */}
      <Modal open={memberModal !== null} onClose={() => setMemberModal(null)} title={memberModal === "new" ? "Nouveau membre" : "Modifier le membre"}>
        <div className="flex flex-col gap-3">
          <input placeholder="Nom" value={(form.name as string) || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select value={(form.role as string) || "enfant"} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <p className="label mt-2">Emoji</p>
          <div className="flex flex-wrap gap-2">
            {MEMBER_EMOJIS.map((e) => (
              <button key={e} className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: form.emoji === e ? "var(--accent)" : "var(--surface2)" }} onClick={() => setForm({ ...form, emoji: e })}>{e}</button>
            ))}
          </div>
          <p className="label mt-2">Couleur</p>
          <div className="flex gap-2">
            {MEMBER_COLORS.map((c) => (
              <button key={c} className="w-8 h-8 rounded-full" style={{ background: c, outline: form.color === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }} onClick={() => setForm({ ...form, color: c })} />
            ))}
          </div>
          <button className="btn btn-primary mt-3" onClick={saveMember}>Sauvegarder</button>
          {memberModal !== "new" && <button className="btn btn-danger" onClick={deleteMember}>Supprimer</button>}
        </div>
      </Modal>

      {/* MODAL CONTACT */}
      <Modal open={contactModal !== null} onClose={() => setContactModal(null)} title={contactModal === "new" ? "Nouveau contact" : "Modifier le contact"}>
        <div className="flex flex-col gap-3">
          <input placeholder="Nom" value={(form.name as string) || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Téléphone" type="tel" value={(form.phone as string) || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select value={(form.relation as string) || "famille"} onChange={(e) => setForm({ ...form, relation: e.target.value })}>
            {CONTACT_RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <p className="label mt-2">Emoji</p>
          <div className="flex flex-wrap gap-2">
            {MEMBER_EMOJIS.slice(0, 10).map((e) => (
              <button key={e} className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: form.emoji === e ? "var(--accent)" : "var(--surface2)" }} onClick={() => setForm({ ...form, emoji: e })}>{e}</button>
            ))}
          </div>
          <button className="btn btn-primary mt-3" onClick={saveContact}>Sauvegarder</button>
          {contactModal !== "new" && <button className="btn btn-danger" onClick={deleteContact}>Supprimer</button>}
        </div>
      </Modal>

      {/* MODAL ADRESSE */}
      <Modal open={addressModal !== null} onClose={() => setAddressModal(null)} title={addressModal === "new" ? "Nouvelle adresse" : "Modifier l'adresse"}>
        <div className="flex flex-col gap-3">
          <input placeholder="Nom de l'adresse" value={(form.name as string) || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <p className="label mt-1">Emoji</p>
          <div className="flex flex-wrap gap-2">
            {ADDRESS_EMOJIS.map((e) => (
              <button key={e} className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: form.emoji === e ? "var(--accent)" : "var(--surface2)" }} onClick={() => setForm({ ...form, emoji: e })}>{e}</button>
            ))}
          </div>
          <p className="label mt-2">Rechercher une adresse</p>
          <input placeholder="Rechercher une adresse..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {nominatimResults.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl" style={{ background: "var(--surface2)" }}>
              {nominatimResults.map((r, i) => (
                <button
                  key={i}
                  className="w-full text-left text-xs p-3 hover:opacity-80 transition-opacity"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  onClick={() => {
                    setForm({ ...form, address: r.display_name, lat: r.lat, lng: r.lon });
                    setSearchQuery("");
                    setNominatimResults([]);
                  }}
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
          {form.address && (
            <p className="text-xs px-1" style={{ color: "var(--green)" }}>
              📍 {form.address as string}
            </p>
          )}
          <p className="label mt-2">Membres associés</p>
          <div className="flex flex-col gap-2">
            {members.map((m) => {
              const selected = ((form.members || []) as string[]).includes(m.id);
              return (
                <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => {
                      const current = (form.members || []) as string[];
                      setForm({
                        ...form,
                        members: selected ? current.filter((id) => id !== m.id) : [...current, m.id],
                      });
                    }}
                    className="!w-4 !h-4 !p-0 rounded"
                  />
                  {m.emoji} {m.name}
                </label>
              );
            })}
          </div>
          <button className="btn btn-primary mt-3" onClick={saveAddress}>Sauvegarder</button>
          {addressModal !== "new" && <button className="btn btn-danger" onClick={deleteAddress}>Supprimer</button>}
        </div>
      </Modal>
    </div>
  );
}
