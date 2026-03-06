"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import Modal from "@/components/Modal";
import type { Member, Contact, Address, DeviceLocation } from "@/lib/types";
import { useRealtimeMembers, useRealtimeContacts, useRealtimeAddresses } from "@/lib/realtime";
import { useToast } from "@/components/Toast";
import { usePullToRefresh, PullIndicator } from "@/lib/usePullToRefresh";

const MapViewDynamic = dynamic(() => import("@/components/MapView"), { ssr: false });
const MapFullDynamic = dynamic(() => import("@/components/MapFull"), { ssr: false });
const AddressPickerMap = dynamic(() => import("@/components/AddressPickerMap"), { ssr: false });

const ROLES: { key: string; label: string; defaultEmoji: string }[] = [
  // Parents
  { key: "papa", label: "Papa", defaultEmoji: "👨" },
  { key: "maman", label: "Maman", defaultEmoji: "👩" },
  // Conjoints
  { key: "conjoint", label: "Conjoint", defaultEmoji: "👨" },
  { key: "conjointe", label: "Conjointe", defaultEmoji: "👩" },
  // Enfants
  { key: "fils", label: "Fils", defaultEmoji: "👦" },
  { key: "fille", label: "Fille", defaultEmoji: "👧" },
  { key: "ado_garcon", label: "Ado (garçon)", defaultEmoji: "🧑" },
  { key: "ado_fille", label: "Ado (fille)", defaultEmoji: "👩" },
  { key: "bebe", label: "Bébé", defaultEmoji: "👶" },
  // Fratrie
  { key: "frere", label: "Frère", defaultEmoji: "👦" },
  { key: "soeur", label: "Sœur", defaultEmoji: "👧" },
  // Grands-parents
  { key: "grand-pere", label: "Grand-père", defaultEmoji: "👴" },
  { key: "grand-mere", label: "Grand-mère", defaultEmoji: "👵" },
  { key: "arriere-grand-pere", label: "Arrière-grand-père", defaultEmoji: "👴" },
  { key: "arriere-grand-mere", label: "Arrière-grand-mère", defaultEmoji: "👵" },
  // Petits-enfants
  { key: "petit-fils", label: "Petit-fils", defaultEmoji: "👦" },
  { key: "petite-fille", label: "Petite-fille", defaultEmoji: "👧" },
  // Belle-famille
  { key: "beau-pere", label: "Beau-père", defaultEmoji: "👨" },
  { key: "belle-mere", label: "Belle-mère", defaultEmoji: "👩" },
  { key: "beau-frere", label: "Beau-frère", defaultEmoji: "👨" },
  { key: "belle-soeur", label: "Belle-sœur", defaultEmoji: "👩" },
  { key: "gendre", label: "Gendre", defaultEmoji: "👨" },
  { key: "belle-fille", label: "Belle-fille", defaultEmoji: "👩" },
  // Famille élargie
  { key: "oncle", label: "Oncle", defaultEmoji: "👨" },
  { key: "tante", label: "Tante", defaultEmoji: "👩" },
  { key: "cousin", label: "Cousin", defaultEmoji: "🧑" },
  { key: "cousine", label: "Cousine", defaultEmoji: "👩" },
  { key: "neveu", label: "Neveu", defaultEmoji: "👦" },
  { key: "niece", label: "Nièce", defaultEmoji: "👧" },
  // Parrainage
  { key: "parrain", label: "Parrain", defaultEmoji: "🧔" },
  { key: "marraine", label: "Marraine", defaultEmoji: "👩" },
  { key: "filleul", label: "Filleul", defaultEmoji: "👦" },
  { key: "filleule", label: "Filleule", defaultEmoji: "👧" },
  // Autre
  { key: "autre", label: "Autre", defaultEmoji: "🧑" },
];

const ROLE_EMOJIS: Record<string, string[]> = {
  papa:        ["👨","🧔","👱‍♂️","👨‍🦰","👨‍🦱","👨‍🦳","🧑‍🦲","🤴","🧑","💪","👔","🏋️‍♂️"],
  maman:       ["👩","👱‍♀️","👩‍🦰","👩‍🦱","👩‍🦳","👸","🧑‍🍼","💃","👠","🌸","🦋"],
  conjoint:    ["👨","🧔","👱‍♂️","👨‍🦰","👨‍🦱","🤵","💍","🧑","💪","👔"],
  conjointe:   ["👩","👱‍♀️","👩‍🦰","👩‍🦱","👰","💍","💃","👠","🌸","🦋"],
  fils:        ["👦","🧒","⚽","🎮","🏀","🚴‍♂️","🎸","🏊‍♂️","🤖","🦸‍♂️","🐶"],
  fille:       ["👧","🧒","🎨","🩰","🦋","🌸","📚","🎀","🧸","🦄","🐱"],
  ado_garcon:  ["🧑","👦","🎮","⚽","🎸","🏀","🎧","📱","🛹","🏄‍♂️","💻"],
  ado_fille:   ["👩","👧","🎧","📱","🎨","💃","📚","🎤","🧘‍♀️","🌟","💅"],
  bebe:        ["👶","🧒","🍼","🧒","🧸","🐣","🌈","⭐","🎀","👣","😴"],
  frere:       ["👦","🧑","⚽","🎮","🏀","🎸","🏋️‍♂️","💪","🛹","🏄‍♂️"],
  soeur:       ["👧","👩","🎨","🩰","🦋","🌸","📚","🎧","💃","🌟"],
  "grand-pere":["👴","🧓","👨‍🦳","🎩","📰","♟️","🎣","🌳","☕","🏌️‍♂️"],
  "grand-mere":["👵","🧓","👩‍🦳","🧶","🌺","☕","🍰","📖","🪴","🌷"],
  "arriere-grand-pere":["👴","🧓","👨‍🦳","🎩","☕","♟️","📰","🌳"],
  "arriere-grand-mere":["👵","🧓","👩‍🦳","🧶","☕","🌺","🍰","📖"],
  "petit-fils": ["👦","🧒","⚽","🎮","🏀","🤖","🦸‍♂️","🐶"],
  "petite-fille":["👧","🧒","🎨","🩰","🦋","🧸","🦄","🐱"],
  "beau-pere": ["👨","🧔","👨‍🦳","👔","🤵","🧑","💼","☕","🏌️‍♂️","📰"],
  "belle-mere": ["👩","👩‍🦳","👱‍♀️","💐","🌸","🧑‍🍼","☕","🌺","🪴","🌷"],
  "beau-frere":["👨","🧔","🧑","⚽","💼","🎸","🏋️‍♂️","🍺","💪"],
  "belle-soeur":["👩","👱‍♀️","🧑","💐","🌸","☕","🎨","💃","🦋"],
  gendre:      ["👨","🧔","🤵","👔","💼","🧑","💪","⚽"],
  "belle-fille":["👩","👰","👱‍♀️","💐","🌸","💃","🦋","☕"],
  oncle:       ["👨","🧔","🧑","💼","⚽","🎸","🏋️‍♂️","🍺","🎣","🏌️‍♂️"],
  tante:       ["👩","👱‍♀️","🧑","💐","🌸","☕","🎨","💃","📚","🌺"],
  cousin:      ["🧑","👦","⚽","🎮","🏀","🎸","🎧","💻","🛹","🏄‍♂️"],
  cousine:     ["👩","👧","🎧","🎨","📱","💃","📚","🌟","💅","🦋"],
  neveu:       ["👦","🧒","⚽","🎮","🏀","🎸","🤖","🦸‍♂️","🐶","🛹"],
  niece:       ["👧","🧒","🎨","🩰","🦋","🌸","📚","🎀","🧸","🦄"],
  parrain:     ["🧔","👨","👨‍🦳","🤵","🎩","💼","⭐","🌟"],
  marraine:    ["👩","👱‍♀️","👩‍🦳","👸","💐","🌸","⭐","🌟"],
  filleul:     ["👦","🧒","⚽","🎮","🌟","⭐","🤖","🦸‍♂️"],
  filleule:    ["👧","🧒","🎨","🌟","⭐","🦋","🧸","🦄"],
  autre:       ["🧑","👤","😊","🌟","💫","🎭","🙂","✨","🦊","🐻","🐼"],
};

const MEMBER_COLORS = ["#3DD6C8","#FF8C42","#FFD166","#FF6B6B","#6BCB77","#B39DDB","#64B5F6","#F48FB1"];
const ADDRESS_EMOJIS = ["🏠","🏫","💼","⚽","🏥","👶","👴","🏪","🎭","🏖️"];
const CONTACT_CATEGORIES: Record<string, string[]> = {
  "Famille": ["Conjoint(e)", "Pere", "Mere", "Fils", "Fille", "Frere", "Soeur", "Beau-pere", "Belle-mere", "Gendre", "Belle-fille", "Grand-pere", "Grand-mere", "Petit-fils", "Petite-fille", "Oncle", "Tante", "Cousin(e)", "Parrain", "Marraine"],
  "Medical": ["Medecin", "Dentiste", "Pediatre", "Kine", "Ophtalmo", "Orthophoniste", "Psychologue", "Pharmacie", "Sage-femme"],
  "Scolaire": ["Professeur", "Directeur", "Nounou", "Baby-sitter", "Creche", "Garderie", "Centre de loisirs"],
  "Professionnel": ["Employeur", "Collegue", "Avocat", "Comptable", "Notaire", "Assurance", "Banque"],
  "Social": ["Voisin(e)", "Ami(e)", "Coach", "Educateur"],
  "Urgences": ["Pompiers", "Police", "SAMU", "Anti-poison", "SOS Medecins"],
};
const CONTACT_EMOJIS: Record<string, string> = {
  "Famille": "👨‍👩‍👧‍👦", "Medical": "🏥", "Scolaire": "🏫", "Professionnel": "💼", "Social": "🤝", "Urgences": "🚨",
  "Conjoint(e)": "💑", "Pere": "👨", "Mere": "👩", "Fils": "👦", "Fille": "👧", "Frere": "👦", "Soeur": "👧",
  "Beau-pere": "👴", "Belle-mere": "👵", "Gendre": "🤵", "Belle-fille": "👰", "Grand-pere": "👴", "Grand-mere": "👵",
  "Petit-fils": "👶", "Petite-fille": "👶", "Oncle": "👨", "Tante": "👩", "Cousin(e)": "🧑", "Parrain": "🧔", "Marraine": "👩",
  "Medecin": "🧑‍⚕️", "Dentiste": "🦷", "Pediatre": "👶", "Kine": "💆", "Ophtalmo": "👁️", "Orthophoniste": "🗣️",
  "Psychologue": "🧠", "Pharmacie": "💊", "Sage-femme": "🤱",
  "Professeur": "👨‍🏫", "Directeur": "🎓", "Nounou": "🧑‍🍼", "Baby-sitter": "🧑‍🍼", "Creche": "🏠", "Garderie": "🏠", "Centre de loisirs": "🎪",
  "Employeur": "💼", "Collegue": "🤝", "Avocat": "⚖️", "Comptable": "📊", "Notaire": "📜", "Assurance": "🛡️", "Banque": "🏦",
  "Voisin(e)": "🏡", "Ami(e)": "🫂", "Coach": "🏋️", "Educateur": "📚",
  "Pompiers": "🚒", "Police": "🚔", "SAMU": "🚑", "Anti-poison": "☠️", "SOS Medecins": "🏥",
};
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
  const { toast } = useToast();
  const { pullDistance, refreshing } = usePullToRefresh(() => load());
  const familyId = profile?.family_id;

  const [members, setMembers] = useState<Member[]>([]);

  // Local roles: each user assigns roles locally
  function getLocalRoles(): Record<string, string> {
    try { return JSON.parse(localStorage.getItem("flowtime_roles") || "{}"); } catch { return {}; }
  }
  function setLocalRole(memberId: string, role: string) {
    const roles = getLocalRoles();
    roles[memberId] = role;
    localStorage.setItem("flowtime_roles", JSON.stringify(roles));
  }
  function getLocalRole(memberId: string, fallback: string): string {
    return getLocalRoles()[memberId] || fallback;
  }
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [devices, setDevices] = useState<DeviceLocation[]>([]);
  const [mapFull, setMapFull] = useState(false);
  const [mapFocusCenter, setMapFocusCenter] = useState<[number, number] | null>(null);
  const [sharingLocation, setSharingLocation] = useState(false);
  const [showFamilyCode, setShowFamilyCode] = useState(false);
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());

  function getAvatarUrl(userId: string): string {
    const { data } = supabase.storage.from("avatars").getPublicUrl(`${userId}/avatar.webp`);
    return data.publicUrl;
  }

  // Modal states
  const [memberModal, setMemberModal] = useState<Member | null | "new">(null);
  const [contactModal, setContactModal] = useState<Contact | null | "new">(null);
  const [addressModal, setAddressModal] = useState<Address | null | "new">(null);

  const [confirmDelete, setConfirmDelete] = useState<{ type: "member" | "contact" | "address"; id: string; label: string } | null>(null);

  // Form states
  const [form, setForm] = useState<Record<string, string | string[]>>({});
  const [nominatimResults, setNominatimResults] = useState<Array<{ display_name: string; lat: string; lon: string }>>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(async () => {
    if (!familyId) return;
    // Get month date range for stats
    const [m, c, a, d] = await Promise.all([
      supabase.from("members").select("*").eq("family_id", familyId),
      supabase.from("contacts").select("*").eq("family_id", familyId),
      supabase.from("addresses").select("*").eq("family_id", familyId),
      supabase.from("device_locations").select("*").eq("family_id", familyId),
    ]);
    if (m.data) {
      const roleOrder: Record<string, number> = {
        "arriere-grand-pere": 0, "arriere-grand-mere": 1,
        "grand-pere": 2, "grand-mere": 3,
        "beau-pere": 4, "belle-mere": 5,
        papa: 6, maman: 7,
        conjoint: 8, conjointe: 9,
        frere: 10, soeur: 11,
        "beau-frere": 12, "belle-soeur": 13,
        oncle: 14, tante: 15,
        ado_garcon: 16, ado_fille: 17,
        fils: 18, fille: 19,
        gendre: 20, "belle-fille": 21,
        cousin: 22, cousine: 23,
        neveu: 24, niece: 25,
        "petit-fils": 26, "petite-fille": 27,
        bebe: 28,
        parrain: 29, marraine: 30,
        filleul: 31, filleule: 32,
        autre: 33,
      };
      const localRoles = getLocalRoles();
      const sorted = [...(m.data as Member[])].sort(
        (a, b) => (roleOrder[localRoles[a.id] || a.role] ?? 9) - (roleOrder[localRoles[b.id] || b.role] ?? 9)
      );
      setMembers(sorted);
    }
    if (c.data) setContacts(c.data as Contact[]);
    if (a.data) setAddresses(a.data as Address[]);
    if (d.data) setDevices(d.data as DeviceLocation[]);
  }, [familyId, profile]);

  useEffect(() => { load(); }, [load]);

  // Realtime: auto-refresh when another member changes data
  useRealtimeMembers(familyId, load);
  useRealtimeContacts(familyId, load);
  useRealtimeAddresses(familyId, load);

  // Polling fallback: refresh every 10s in case realtime isn't enabled
  useEffect(() => {
    if (!familyId) return;
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [familyId, load]);

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
      setForm({ name: "", role: "fils", emoji: "👦", color: "#3DD6C8", birth_date: "", phone: "" });
    } else {
      setForm({ name: m.name, role: getLocalRole(m.id, m.role), emoji: m.emoji, color: m.color, birth_date: m.birth_date || "", phone: m.phone || "" });
    }
    setMemberModal(m);
  }

  async function saveMember() {
    if (!familyId) return;
    const localRole = (form.role as string) || "autre";
    const data = { family_id: familyId, name: form.name as string, emoji: form.emoji as string, color: form.color as string, birth_date: (form.birth_date as string) || null, phone: (form.phone as string) || null };
    if (memberModal === "new") {
      const { data: inserted } = await supabase.from("members").insert({ ...data, role: localRole }).select("id").single();
      if (inserted) setLocalRole(inserted.id, localRole);
      // Auto-create birthday if birth_date set
      if (inserted && data.birth_date) {
        await supabase.from("birthdays").insert({ family_id: familyId, name: data.name, date: data.birth_date, emoji: data.emoji, member_id: inserted.id });
      }
    } else if (memberModal) {
      setLocalRole(memberModal.id, localRole);
      await supabase.from("members").update(data).eq("id", memberModal.id);
      // Sync linked birthday
      if (data.birth_date) {
        const { data: existing } = await supabase.from("birthdays").select("id").eq("member_id", memberModal.id).maybeSingle();
        if (existing) {
          await supabase.from("birthdays").update({ name: data.name, date: data.birth_date, emoji: data.emoji }).eq("id", existing.id);
        } else {
          await supabase.from("birthdays").insert({ family_id: familyId, name: data.name, date: data.birth_date, emoji: data.emoji, member_id: memberModal.id });
        }
      }
    }
    setMemberModal(null);
    load();
    toast("Membre sauvegardé", "success");
  }

  async function deleteMember() {
    if (memberModal && memberModal !== "new") {
      setConfirmDelete({ type: "member", id: memberModal.id, label: memberModal.name });
    }
  }

  // CONTACT CRUD
  function openContactModal(c: Contact | "new") {
    if (c === "new") {
      setForm({ name: "", phone: "", relation: "Ami(e)", emoji: "🫂", visible_to: [], assigned_to: [] });
    } else {
      setForm({ name: c.name, phone: c.phone, relation: c.relation, emoji: c.emoji, visible_to: c.visible_to || [], assigned_to: c.assigned_to || [] });
    }
    setContactModal(c);
  }

  async function saveContact() {
    if (!familyId) return;
    const visTo = (form.visible_to as string[]);
    const assignTo = Array.isArray(form.assigned_to) ? form.assigned_to : [];
    const isShared = !visTo || visTo.length === 0;
    const data = {
      family_id: familyId,
      name: form.name as string,
      phone: form.phone as string,
      relation: form.relation as string,
      emoji: form.emoji as string,
      visible_to: visTo && visTo.length > 0 ? visTo : null,
      assigned_to: isShared && assignTo.length > 0 ? assignTo : null,
    };
    let cResult;
    if (contactModal === "new") {
      cResult = await supabase.from("contacts").insert(data);
    } else if (contactModal) {
      cResult = await supabase.from("contacts").update(data).eq("id", contactModal.id);
    }
    if (cResult?.error) {
      console.error("saveContact error:", cResult.error);
      toast(`Erreur: ${cResult.error.message}`, "error");
      return;
    }
    setContactModal(null);
    load();
    toast("Contact sauvegardé", "success");
  }

  async function deleteContact() {
    if (contactModal && contactModal !== "new") {
      setConfirmDelete({ type: "contact", id: contactModal.id, label: contactModal.name });
    }
  }

  // ADDRESS CRUD
  function openAddressModal(a: Address | "new") {
    if (a === "new") {
      setForm({ name: "", emoji: "📍", address: "", lat: "", lng: "", members: [], visible_to: [] });
    } else {
      setForm({
        name: a.name,
        emoji: a.emoji,
        address: a.address,
        lat: a.lat?.toString() || "",
        lng: a.lng?.toString() || "",
        members: (a.members || []) as string[],
        visible_to: a.visible_to || [],
      });
    }
    setSearchQuery("");
    setNominatimResults([]);
    setAddressModal(a);
  }

  async function saveAddress() {
    if (!familyId) return;
    const visTo = (form.visible_to as string[]);
    const isSharedAddr = !visTo || visTo.length === 0;
    const data = {
      family_id: familyId,
      name: form.name as string,
      emoji: form.emoji as string,
      address: form.address as string,
      lat: form.lat ? parseFloat(form.lat as string) : null,
      lng: form.lng ? parseFloat(form.lng as string) : null,
      members: isSharedAddr ? (Array.isArray(form.members) ? form.members : []) : [],
      visible_to: visTo && visTo.length > 0 ? visTo : null,
    };
    let result;
    if (addressModal === "new") {
      result = await supabase.from("addresses").insert(data);
    } else if (addressModal) {
      result = await supabase.from("addresses").update(data).eq("id", (addressModal as Address).id);
    }
    if (result?.error) {
      console.error("saveAddress error:", result.error);
      toast(`Erreur: ${result.error.message}`, "error");
      return;
    }
    setAddressModal(null);
    load();
    toast("Adresse sauvegardée", "success");
  }

  async function deleteAddress() {
    if (addressModal && addressModal !== "new") {
      setConfirmDelete({ type: "address", id: (addressModal as Address).id, label: (addressModal as Address).name });
    }
  }

  async function executeDelete() {
    if (!confirmDelete) return;
    const { type, id, label } = confirmDelete;
    await supabase.from(type === "member" ? "members" : type === "contact" ? "contacts" : "addresses").delete().eq("id", id);
    setConfirmDelete(null);
    if (type === "member") setMemberModal(null);
    else if (type === "contact") setContactModal(null);
    else setAddressModal(null);
    load();
    toast(`${label} supprimé`, "success");
  }

  // Update address after marker drag on map
  async function handleAddressMoved(id: string, lat: number, lng: number, address: string) {
    await supabase.from("addresses").update({ lat, lng, address }).eq("id", id);
    setAddresses((prev) => prev.map((a) => a.id === id ? { ...a, lat, lng, address } : a));
  }

  // Device location sharing
  async function toggleLocationSharing() {
    if (!familyId || !profile) return;

    if (sharingLocation) {
      // Stop sharing — delete device location
      await supabase.from("device_locations").delete().eq("user_id", profile.id);
      setSharingLocation(false);
      load();
      return;
    }

    // Start sharing
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const existing = devices.find((d) => d.user_id === profile.id);
        const data = {
          family_id: familyId,
          user_id: profile.id,
          device_name: profile.first_name || "Mon appareil",
          emoji: profile.emoji || "📱",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          updated_at: new Date().toISOString(),
        };
        if (existing) {
          await supabase.from("device_locations").update(data).eq("id", existing.id);
        } else {
          await supabase.from("device_locations").insert(data);
        }
        setSharingLocation(true);
        load();
      },
      () => alert("Impossible d'accéder à la géolocalisation"),
      { enableHighAccuracy: true }
    );
  }

  // Location tracking is handled persistently in layout.tsx
  // Check if already sharing
  useEffect(() => {
    if (profile && devices.some((d) => d.user_id === profile.id)) {
      setSharingLocation(true);
    }
  }, [profile, devices]);

  function copyFamilyCode() {
    if (!familyId) return;
    const code = familyId.slice(0, 8).toUpperCase();
    navigator.clipboard.writeText(code);
    setShowFamilyCode(true);
    setTimeout(() => setShowFamilyCode(false), 3000);
  }

  // Map markers
  const mapMarkers = addresses
    .filter((a) => a.lat && a.lng)
    .map((a) => ({
      id: a.id,
      lat: a.lat!,
      lng: a.lng!,
      emoji: a.emoji,
      name: a.name,
      type: "address" as const,
      draggable: true,
    }));

  const mapCenter: [number, number] = profile?.lat && profile?.lng
    ? [profile.lat, profile.lng]
    : mapMarkers.length > 0
      ? [mapMarkers[0].lat, mapMarkers[0].lng]
      : [46.2044, 5.226];

  const deviceMapMarkers = devices.map((d) => ({
    id: d.id,
    lat: d.lat,
    lng: d.lng,
    emoji: d.emoji,
    name: d.device_name,
    color: "#3DD6C8",
    type: "device" as const,
    updatedAt: d.updated_at,
  }));

  const filledAddresses = addresses.filter((a) => a.address).length;

  return (
    <div className="px-4 py-4 animate-in gradient-bg" style={{ paddingBottom: 80 }}>
      <PullIndicator pullDistance={pullDistance} refreshing={refreshing} />
      <h1 className="text-xl font-bold mb-6">Famille</h1>

      {/* MEMBRES */}
      <div data-tutorial="famille-membres" className="stagger-in">
      <p className="label">Membres de la famille</p>
      {/* If user has no linked member, show a picker to self-identify */}
      {profile && !members.some((m) => m.user_id === profile.id) && members.filter((m) => !m.user_id).length > 0 && (
        <div className="card !py-2 !px-3 mb-2" style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)" }}>
          <p className="text-xs font-bold mb-1.5" style={{ color: "var(--accent)" }}>Quel membre êtes-vous ?</p>
          <div className="flex flex-wrap gap-1.5">
            {members.filter((m) => !m.user_id).map((m) => (
              <button
                key={m.id}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                style={{ background: "var(--surface2)", color: "var(--text)" }}
                onClick={async () => {
                  await supabase.from("members").update({ user_id: profile.id }).eq("id", m.id);
                  load();
                }}
              >
                {m.emoji} {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {(() => {
        return members.filter((m) => m.user_id !== profile?.id).map((m) => {
        const age = m.birth_date ? Math.floor((Date.now() - new Date(m.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : null;
        return (
          <div key={m.id} className="card flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="w-10 h-10 flex items-center justify-center rounded-full text-xl cursor-pointer" style={{ background: "var(--surface2)" }} onClick={() => openMemberModal(m)}>{m.emoji}</div>
            <div className="flex-1 cursor-pointer" onClick={() => openMemberModal(m)}>
              <p className="font-bold text-sm flex items-center gap-1.5">
                {m.name}
              </p>
              <p className="text-xs" style={{ color: "var(--dim)" }}>
                {ROLES.find((r) => r.key === getLocalRole(m.id, m.role))?.label || getLocalRole(m.id, m.role)}
                {age !== null && ` · ${age} ans`}
                {m.phone && ` · ${m.phone}`}
              </p>
            </div>
            {m.phone && (
              <a
                href={`tel:${m.phone}`}
                className="w-10 h-10 flex items-center justify-center rounded-full text-lg shrink-0 active:scale-90 transition-transform"
                style={{ background: "rgba(94,200,158,0.12)" }}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Appeler ${m.name}`}
              >
                📞
              </a>
            )}
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
          </div>
        );
      });
      })()}
      </div>

      {/* CONTACTS */}
      <p className="label">Contacts de confiance</p>
      {Object.entries(CONTACT_CATEGORIES).map(([cat]) => {
        const myMember = members.find((m) => m.name.toLowerCase() === (profile?.first_name || "").toLowerCase());
        const catContacts = contacts.filter((c) => {
          const allRelations = CONTACT_CATEGORIES[cat];
          const matchesCat = allRelations.includes(c.relation) || c.relation === cat.toLowerCase();
          if (!matchesCat) return false;
          if (!c.visible_to || c.visible_to.length === 0) return true;
          if (myMember && c.visible_to.includes(myMember.id)) return true;
          return false;
        });
        if (catContacts.length === 0) return null;
        return (
          <div key={cat} className="mb-3">
            <p className="text-[10px] font-bold uppercase mb-1.5 flex items-center gap-1" style={{ color: "var(--dim)" }}>
              {CONTACT_EMOJIS[cat] || "📌"} {cat}
            </p>
            {catContacts.map((c) => (
              <div key={c.id} className="card !mb-1.5 flex items-center gap-3 active:scale-[0.98] transition-transform">
                <div className="w-10 h-10 flex items-center justify-center rounded-full text-xl cursor-pointer" style={{ background: "var(--surface2)" }} onClick={() => openContactModal(c)}>
                  {CONTACT_EMOJIS[c.relation] || c.emoji}
                </div>
                <div className="flex-1 cursor-pointer" onClick={() => openContactModal(c)}>
                  <p className="font-bold text-sm">{c.name}</p>
                  <p className="text-xs" style={{ color: "var(--dim)" }}>
                    {c.relation}
                    {c.visible_to && c.visible_to.length > 0 && <span style={{ color: "var(--faint)" }}> · 🔒 {c.visible_to.length}</span>}
                    {(() => {
                      const arr = Array.isArray(c.assigned_to) ? c.assigned_to : [];
                      const names = arr.map((id) => { const m = members.find((m) => m.id === id); return m ? `${m.emoji} ${m.name}` : ""; }).filter(Boolean);
                      return names.length > 0 ? <span style={{ color: "var(--faint)" }}> · De {names.join(", ")}</span> : null;
                    })()}
                  </p>
                </div>
                {c.phone && (
                  <a
                    href={`tel:${c.phone}`}
                    className="w-10 h-10 flex items-center justify-center rounded-full text-lg shrink-0 active:scale-90 transition-transform"
                    style={{ background: "rgba(94,200,158,0.12)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    📞
                  </a>
                )}
              </div>
            ))}
          </div>
        );
      })}
      {/* Contacts without matching category */}
      {(() => {
        const myMember = members.find((m) => m.name.toLowerCase() === (profile?.first_name || "").toLowerCase());
        const otherContacts = contacts.filter((c) => {
          const inCat = Object.values(CONTACT_CATEGORIES).flat().includes(c.relation) || Object.keys(CONTACT_CATEGORIES).map(k => k.toLowerCase()).includes(c.relation);
          if (inCat) return false;
          if (!c.visible_to || c.visible_to.length === 0) return true;
          if (myMember && c.visible_to.includes(myMember.id)) return true;
          return false;
        });
        if (otherContacts.length === 0) return null;
        return (
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase mb-1.5" style={{ color: "var(--dim)" }}>📌 Autres</p>
          {otherContacts.map((c) => (
            <div key={c.id} className="card !mb-1.5 flex items-center gap-3 active:scale-[0.98] transition-transform">
              <div className="w-10 h-10 flex items-center justify-center rounded-full text-xl cursor-pointer" style={{ background: "var(--surface2)" }} onClick={() => openContactModal(c)}>{c.emoji}</div>
              <div className="flex-1 cursor-pointer" onClick={() => openContactModal(c)}>
                <p className="font-bold text-sm">{c.name}</p>
                <p className="text-xs" style={{ color: "var(--dim)" }}>
                  {c.relation}{c.phone ? ` · ${c.phone}` : ""}
                  {(() => {
                    const arr = Array.isArray(c.assigned_to) ? c.assigned_to : [];
                    const names = arr.map((id) => { const m = members.find((m) => m.id === id); return m ? `${m.emoji} ${m.name}` : ""; }).filter(Boolean);
                    return names.length > 0 ? <span style={{ color: "var(--faint)" }}> · De {names.join(", ")}</span> : null;
                  })()}
                </p>
              </div>
              {c.phone && (
                <a href={`tel:${c.phone}`} className="w-10 h-10 flex items-center justify-center rounded-full text-lg shrink-0 active:scale-90 transition-transform"
                  style={{ background: "rgba(94,200,158,0.12)" }} onClick={(e) => e.stopPropagation()}>📞</a>
              )}
            </div>
          ))}
        </div>
        );
      })()}

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
      {addresses.filter((a) => {
        if (!a.visible_to || a.visible_to.length === 0) return true;
        const myMember = members.find((m) => m.name.toLowerCase() === (profile?.first_name || "").toLowerCase());
        return myMember ? a.visible_to.includes(myMember.id) : false;
      }).map((a) => (
        <div
          key={a.id}
          className="card flex items-center gap-3 cursor-pointer"
          onClick={() => openAddressModal(a)}
          style={{ borderLeft: `3px solid ${a.address ? "var(--green)" : "var(--red)"}` }}
        >
          <div className="text-xl">{a.emoji}</div>
          <div className="flex-1">
            <p className="font-bold text-sm">
              {a.name}
              {a.visible_to && a.visible_to.length > 0 && <span className="text-[10px] ml-1.5" style={{ color: "var(--faint)" }}>🔒</span>}
            </p>
            <p className="text-xs" style={{ color: a.address ? "var(--dim)" : "var(--red)" }}>
              {a.address || "⚠️ Adresse manquante"}
            </p>
            {(() => {
              const arr = Array.isArray(a.members) ? a.members : [];
              const names = arr.map((mid) => { const mem = members.find((m) => m.id === mid); return mem ? `${mem.emoji} ${mem.name}` : ""; }).filter(Boolean);
              return names.length > 0 ? <p className="text-[10px] mt-0.5" style={{ color: "var(--faint)" }}>De {names.join(", ")}</p> : null;
            })()}
          </div>
          {a.lat && a.lng && (
            <button
              className="w-9 h-9 flex items-center justify-center rounded-full shrink-0 active:scale-90 transition-transform"
              style={{ background: "var(--accent-soft)" }}
              onClick={(e) => { e.stopPropagation(); setMapFocusCenter([a.lat!, a.lng!]); setMapFull(true); }}
              title="Voir sur la carte"
            >📍</button>
          )}
        </div>
      ))}

      {/* LOCALISATION */}
      <p className="label">Localisation famille</p>
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold">Partager ma position</p>
            <p className="text-[11px]" style={{ color: "var(--dim)" }}>
              {sharingLocation ? "Position partagée en temps réel" : "Désactivé"}
            </p>
          </div>
          <button
            className="w-12 h-7 rounded-full relative transition-colors"
            style={{ background: sharingLocation ? "var(--teal)" : "var(--surface2)" }}
            onClick={toggleLocationSharing}
          >
            <span
              className="absolute w-5 h-5 rounded-full bg-white top-1 transition-all"
              style={{ left: sharingLocation ? 26 : 4 }}
            />
          </button>
        </div>

        {devices.length > 0 && (
          <div className="flex flex-col gap-2 mb-3">
            {devices.map((d) => {
              const ago = Math.round((Date.now() - new Date(d.updated_at).getTime()) / 60000);
              const showAvatar = !failedAvatars.has(d.user_id);
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 text-xs cursor-pointer active:scale-[0.98] transition-transform rounded-xl px-2 py-2 -mx-2"
                  style={{ background: "transparent" }}
                  onClick={() => { setMapFocusCenter([d.lat, d.lng]); setMapFull(true); }}
                >
                  <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-sm overflow-hidden relative" style={{ background: "var(--surface2)" }}>
                    {showAvatar ? (
                      <img
                        src={getAvatarUrl(d.user_id)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={() => setFailedAvatars((prev) => new Set(prev).add(d.user_id))}
                      />
                    ) : (
                      <span className="text-lg">{d.emoji}</span>
                    )}
                    <span
                      className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                      style={{ background: ago < 5 ? "var(--green)" : ago < 30 ? "var(--warm)" : "var(--red)", borderColor: "var(--bg)" }}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-xs">{d.device_name}</p>
                    <p className="text-[10px]" style={{ color: "var(--dim)" }}>{ago < 1 ? "En ligne" : `il y a ${ago} min`}</p>
                  </div>
                  <span className="text-sm" style={{ color: "var(--faint)" }}>›</span>
                </div>
              );
            })}
          </div>
        )}

        <button className="btn btn-secondary text-xs !py-2" onClick={copyFamilyCode}>
          {showFamilyCode
            ? `✓ Code copié : ${familyId?.slice(0, 8).toUpperCase()}`
            : "📋 Copier le code famille"}
        </button>
        <p className="text-[10px] mt-2" style={{ color: "var(--faint)" }}>
          Partagez ce code pour que vos proches rejoignent votre famille
        </p>
      </div>

      {/* MINI CARTE */}
      <div className="mb-4 mt-4" data-tutorial="famille-map" style={{ position: "relative", zIndex: 0 }}>
        <p className="label">Carte</p>
        <MapViewDynamic
          markers={[...mapMarkers, ...deviceMapMarkers]}
          center={mapCenter}
          height="220px"
          onMapClick={() => setMapFull(true)}
        />
        <p className="text-[10px] text-center mt-2" style={{ color: "var(--faint)" }}>
          Appuie pour ouvrir en plein écran
        </p>
      </div>

      {/* CARTE PLEIN ECRAN */}
      {mapFull && (
        <MapFullDynamic
          markers={mapMarkers}
          center={mapFocusCenter || mapCenter}
          onClose={() => { setMapFull(false); setMapFocusCenter(null); }}
          deviceMarkers={deviceMapMarkers}
          onAddressMoved={handleAddressMoved}
          familyId={familyId}
        />
      )}

      {/* MODAL MEMBRE */}
      <Modal open={memberModal !== null} onClose={() => setMemberModal(null)} title={memberModal === "new" ? "Nouveau membre" : "Modifier le membre"}>
        <div className="flex flex-col gap-3">
          <input placeholder="Nom" value={(form.name as string) || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Téléphone (optionnel)" type="tel" value={(form.phone as string) || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <p className="label">Date de naissance</p>
          <input type="date" value={(form.birth_date as string) || ""} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          <p className="label">Rôle</p>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r.key}
                className="px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                style={{
                  background: form.role === r.key ? "var(--accent)" : "var(--surface2)",
                  color: form.role === r.key ? "#fff" : "var(--text)",
                }}
                onClick={() => setForm({ ...form, role: r.key, emoji: r.defaultEmoji })}
              >
                {r.defaultEmoji} {r.label}
              </button>
            ))}
          </div>
          <p className="label mt-2">Emoji</p>
          <div className="flex flex-wrap gap-2">
            {(ROLE_EMOJIS[(form.role as string) || "autre"] || ROLE_EMOJIS.autre).map((e) => (
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
          <p className="label">Catégorie</p>
          <select value={(form.relation as string) || "Ami(e)"} onChange={(e) => setForm({ ...form, relation: e.target.value, emoji: CONTACT_EMOJIS[e.target.value] || form.emoji })}>
            {Object.entries(CONTACT_CATEGORIES).map(([cat, relations]) => (
              <optgroup key={cat} label={`${CONTACT_EMOJIS[cat] || ""} ${cat}`}>
                {relations.map((r) => <option key={r} value={r}>{CONTACT_EMOJIS[r] || ""} {r}</option>)}
              </optgroup>
            ))}
          </select>
          <p className="label mt-2">Visibilité</p>
          <div className="flex gap-2">
            {[
              { key: "famille", label: "👨‍👩‍👧‍👦 Famille", desc: "Tout le monde voit" },
              { key: "perso", label: "🔒 Personnel", desc: "Moi uniquement" },
            ].map((opt) => {
              const isPerso = ((form.visible_to as string[]) || []).length > 0;
              const sel = opt.key === "perso" ? isPerso : !isPerso;
              return (
                <button key={opt.key} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-center transition-colors"
                  style={{ background: sel ? "var(--accent)" : "var(--surface2)", color: sel ? "#fff" : "var(--dim)" }}
                  onClick={() => {
                    if (opt.key === "perso") {
                      const myMember = members.find((m) => m.name.toLowerCase() === (profile?.first_name || "").toLowerCase());
                      setForm({ ...form, visible_to: myMember ? [myMember.id] : ["__me__"] });
                    } else {
                      setForm({ ...form, visible_to: [] });
                    }
                  }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
          {/* Assigned to members — only for shared contacts */}
          {((form.visible_to as string[]) || []).length === 0 && members.length > 0 && (
            <>
              <p className="label mt-2">Pour qui ?</p>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const sel = ((form.assigned_to as string[]) || []).includes(m.id);
                  return (
                    <button key={m.id} className="px-3 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1"
                      style={{ background: sel ? "var(--accent)" : "var(--surface2)", color: sel ? "#fff" : "var(--dim)" }}
                      onClick={() => {
                        const cur = (form.assigned_to as string[]) || [];
                        setForm({ ...form, assigned_to: sel ? cur.filter((id) => id !== m.id) : [...cur, m.id] });
                      }}>
                      {m.emoji} {m.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px]" style={{ color: "var(--faint)" }}>Laissez vide = pour toute la famille</p>
            </>
          )}
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
                  style={{ borderBottom: "1px solid var(--glass-border)" }}
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
          {/* Mini-map for precise marker placement */}
          {(form.lat || form.lng) && (
            <div className="mt-1">
              <p className="text-[10px] font-bold uppercase mb-1.5" style={{ color: "var(--dim)" }}>Position du marqueur</p>
              <AddressPickerMap
                lat={form.lat ? parseFloat(form.lat as string) : null}
                lng={form.lng ? parseFloat(form.lng as string) : null}
                emoji={(form.emoji as string) || "📍"}
                onPositionChange={async (lat, lng) => {
                  setForm((prev) => ({ ...prev, lat: lat.toString(), lng: lng.toString() }));
                  try {
                    const res = await fetch(
                      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                      { headers: { "User-Agent": "FlowTime/1.0" } }
                    );
                    const data = await res.json();
                    if (data.display_name) {
                      const short = data.display_name.split(",").slice(0, 3).join(",").trim();
                      setForm((prev) => ({ ...prev, address: short }));
                    }
                  } catch {}
                }}
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--faint)" }}>Déplace le marqueur ou tape sur la carte pour ajuster</p>
            </div>
          )}
          <p className="label mt-2">Visibilité</p>
          <div className="flex gap-2">
            {[
              { key: "famille", label: "👨‍👩‍👧‍👦 Famille" },
              { key: "perso", label: "🔒 Personnel" },
            ].map((opt) => {
              const isPerso = ((form.visible_to as string[]) || []).length > 0;
              const sel = opt.key === "perso" ? isPerso : !isPerso;
              return (
                <button key={opt.key} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-center transition-colors"
                  style={{ background: sel ? "var(--accent)" : "var(--surface2)", color: sel ? "#fff" : "var(--dim)" }}
                  onClick={() => {
                    if (opt.key === "perso") {
                      const myMember = members.find((m) => m.name.toLowerCase() === (profile?.first_name || "").toLowerCase());
                      setForm({ ...form, visible_to: myMember ? [myMember.id] : ["__me__"], members: [] });
                    } else {
                      setForm({ ...form, visible_to: [] });
                    }
                  }}>
                  {opt.label}
                </button>
              );
            })}
          </div>
          {/* Membres associés — only for shared addresses */}
          {((form.visible_to as string[]) || []).length === 0 && members.length > 0 && (
            <>
              <p className="label mt-2">Pour qui ?</p>
              <div className="flex flex-wrap gap-2">
                {members.map((m) => {
                  const sel = ((form.members || []) as string[]).includes(m.id);
                  return (
                    <button key={m.id} className="px-3 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1"
                      style={{ background: sel ? "var(--accent)" : "var(--surface2)", color: sel ? "#fff" : "var(--dim)" }}
                      onClick={() => {
                        const cur = (form.members || []) as string[];
                        setForm({ ...form, members: sel ? cur.filter((id) => id !== m.id) : [...cur, m.id] });
                      }}>
                      {m.emoji} {m.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px]" style={{ color: "var(--faint)" }}>Laissez vide = pour toute la famille</p>
            </>
          )}
          <button className="btn btn-primary mt-3" onClick={saveAddress}>Sauvegarder</button>
          {addressModal !== "new" && <button className="btn btn-danger" onClick={deleteAddress}>Supprimer</button>}
        </div>
      </Modal>

      {/* MODAL CONFIRMATION SUPPRESSION */}
      <Modal open={confirmDelete !== null} onClose={() => setConfirmDelete(null)} title="Confirmer la suppression">
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--dim)" }}>
            Supprimer <strong style={{ color: "var(--text)" }}>{confirmDelete?.label}</strong> ? Cette action est irréversible.
          </p>
          <div className="flex gap-2">
            <button className="btn flex-1" style={{ background: "var(--surface2)" }} onClick={() => setConfirmDelete(null)}>Annuler</button>
            <button className="btn btn-danger flex-1" onClick={executeDelete}>Supprimer</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
