"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile, useTutorial } from "../layout";
import Modal from "@/components/Modal";
import AvatarUpload from "@/components/AvatarUpload";
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from "@/lib/push";
import { QRCodeSVG } from "qrcode.react";

function Section({ title, emoji, children, defaultOpen = false, forceOpen = false }: { title: string; emoji: string; children: React.ReactNode; defaultOpen?: boolean; forceOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = open || forceOpen;
  return (
    <div className="mt-4">
      <button
        className="w-full flex items-center gap-2.5 py-2.5 px-1 active:opacity-70"
        onClick={() => setOpen(!open)}
      >
        <span className="text-base">{emoji}</span>
        <span className="text-sm font-bold flex-1 text-left">{title}</span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="currentColor"
          style={{ color: "var(--dim)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.25s ease" }}
        >
          <path d="M2 4.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div
        style={{
          display: "grid",
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          transition: "grid-template-rows 0.3s ease",
        }}
      >
        <div style={{ overflow: "hidden", paddingTop: 1, paddingBottom: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const ROLES: { key: string; label: string; defaultEmoji: string }[] = [
  { key: "papa", label: "Papa", defaultEmoji: "👨" },
  { key: "maman", label: "Maman", defaultEmoji: "👩" },
  { key: "conjoint", label: "Conjoint", defaultEmoji: "👨" },
  { key: "conjointe", label: "Conjointe", defaultEmoji: "👩" },
  { key: "fils", label: "Fils", defaultEmoji: "👦" },
  { key: "fille", label: "Fille", defaultEmoji: "👧" },
  { key: "ado_garcon", label: "Ado (garçon)", defaultEmoji: "🧑" },
  { key: "ado_fille", label: "Ado (fille)", defaultEmoji: "👩" },
  { key: "bebe", label: "Bébé", defaultEmoji: "👶" },
  { key: "frere", label: "Frère", defaultEmoji: "👦" },
  { key: "soeur", label: "Sœur", defaultEmoji: "👧" },
  { key: "grand-pere", label: "Grand-père", defaultEmoji: "👴" },
  { key: "grand-mere", label: "Grand-mère", defaultEmoji: "👵" },
  { key: "autre", label: "Autre", defaultEmoji: "🧑" },
];

const ROLE_EMOJIS: Record<string, string[]> = {
  papa: ["👨","🧔","👱‍♂️","👨‍🦰","👨‍🦱","👨‍🦳","🤴","💪"],
  maman: ["👩","👱‍♀️","👩‍🦰","👩‍🦱","👩‍🦳","👸","💃","🌸"],
  conjoint: ["👨","🧔","👱‍♂️","👨‍🦰","🤵","💍","💪"],
  conjointe: ["👩","👱‍♀️","👩‍🦰","👰","💍","💃","🌸"],
  fils: ["👦","🧒","⚽","🎮","🏀","🎸","🤖","🦸‍♂️","🐶"],
  fille: ["👧","🧒","🎨","🩰","🦋","🌸","📚","🧸","🦄","🐱"],
  ado_garcon: ["🧑","👦","🎮","⚽","🎸","🎧","📱","🛹","💻"],
  ado_fille: ["👩","👧","🎧","📱","🎨","💃","📚","🌟","💅"],
  bebe: ["👶","🧒","🍼","🧸","🐣","🌈","⭐","👣","😴"],
  frere: ["👦","🧑","⚽","🎮","🏀","🎸","💪","🛹"],
  soeur: ["👧","👩","🎨","🩰","🦋","🌸","📚","🌟"],
  "grand-pere": ["👴","🧓","👨‍🦳","🎩","☕","🎣","🌳"],
  "grand-mere": ["👵","🧓","👩‍🦳","🧶","🌺","☕","🍰"],
  autre: ["🧑","👤","😊","🌟","💫","🎭","🙂","✨"],
};

const MEMBER_COLORS = ["#3DD6C8","#FF8C42","#FFD166","#FF6B6B","#6BCB77","#B39DDB","#64B5F6","#F48FB1"];

const CONTACT_CATEGORIES: Record<string, string[]> = {
  "Famille": ["Conjoint(e)", "Pere", "Mere", "Fils", "Fille", "Frere", "Soeur", "Grand-pere", "Grand-mere"],
  "Medical": ["Medecin", "Dentiste", "Pediatre", "Kine", "Ophtalmo", "Pharmacie"],
  "Scolaire": ["Professeur", "Directeur", "Nounou", "Baby-sitter", "Creche"],
  "Professionnel": ["Employeur", "Collegue", "Avocat", "Comptable", "Banque"],
  "Social": ["Voisin(e)", "Ami(e)", "Coach"],
  "Urgences": ["Pompiers", "Police", "SAMU", "SOS Medecins"],
};
const CONTACT_EMOJIS: Record<string, string> = {
  "Famille": "👨‍👩‍👧‍👦", "Medical": "🏥", "Scolaire": "🏫", "Professionnel": "💼", "Social": "🤝", "Urgences": "🚨",
  "Conjoint(e)": "💑", "Pere": "👨", "Mere": "👩", "Fils": "👦", "Fille": "👧", "Frere": "👦", "Soeur": "👧",
  "Grand-pere": "👴", "Grand-mere": "👵",
  "Medecin": "🧑‍⚕️", "Dentiste": "🦷", "Pediatre": "👶", "Kine": "💆", "Ophtalmo": "👁️", "Pharmacie": "💊",
  "Professeur": "👨‍🏫", "Directeur": "🎓", "Nounou": "🧑‍🍼", "Baby-sitter": "🧑‍🍼", "Creche": "🏠",
  "Employeur": "💼", "Collegue": "🤝", "Avocat": "⚖️", "Comptable": "📊", "Banque": "🏦",
  "Voisin(e)": "🏡", "Ami(e)": "🫂", "Coach": "🏋️",
  "Pompiers": "🚒", "Police": "🚔", "SAMU": "🚑", "SOS Medecins": "🏥",
};
const ADDRESS_EMOJIS = ["🏠","🏫","💼","⚽","🏥","👶","👴","🏪","🎭","🏖️"];

const PROFILE_EMOJIS = [
  // Hommes
  "👨","🧔","👱‍♂️","👨‍🦰","👨‍🦱","👨‍🦳","🧑‍🦲","🤴",
  // Femmes
  "👩","👱‍♀️","👩‍🦰","👩‍🦱","👩‍🦳","👸",
  // Jeunes
  "👦","👧","🧒","🧑",
  // Bébés / Seniors
  "👶","🧒","👴","👵","🧑‍🍼",
  // Fun
  "🐱","🐶","🦊","🐻","🐼","🦁","🐸","🌟",
];

export default function ReglagesPage() {
  const router = useRouter();
  const { profile, refreshProfile } = useProfile();
  const { tutorialActive, currentSection, startTutorial, startTutorialAtSection, completedSections } = useTutorial();

  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [birthDate, setBirthDate] = useState(profile?.birth_date || "");
  const [emoji, setEmoji] = useState(profile?.emoji || "👤");
  const [saving, setSaving] = useState(false);
  const [geoEnabled, setGeoEnabled] = useState(!!(profile?.lat && profile?.lng));

  const [emojiModal, setEmojiModal] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  const [theme, setTheme] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("flowtime_theme") || "dark";
    }
    return "dark";
  });
  const [lang, setLang] = useState<"fr" | "en">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("flowtime_lang") as "fr" | "en") || "fr";
    }
    return "fr";
  });

  const PALETTE_CLASSES = ["light","p1","p2","p3","p4","p5","p6","p7","p8","p9","p10","p11","p12","p13","p14","p15","p16","p17","p18","p19","p20","p21","p22","p23","p24","p25","p26","p27","p28","p29","p30"];

  function changeTheme(t: string) {
    setTheme(t);
    localStorage.setItem("flowtime_theme", t);
    const themeClasses = PALETTE_CLASSES;
    document.documentElement.classList.remove(...themeClasses);
    if (t === "system") {
      const resolved = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      if (resolved === "light") document.documentElement.classList.add("light");
    } else if (t !== "dark") {
      document.documentElement.classList.add(t);
    }
  }

  function changeLang(l: "fr" | "en") {
    setLang(l);
    localStorage.setItem("flowtime_lang", l);
    document.documentElement.lang = l;
  }

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    isPushSubscribed().then(setPushEnabled);
  }, []);

  async function togglePush() {
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush();
        setPushEnabled(false);
      } else {
        const sub = await subscribeToPush();
        setPushEnabled(!!sub);
      }
    } catch { /* ignore */ }
    setPushLoading(false);
  }

  const [familyModal, setFamilyModal] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinSuccess, setJoinSuccess] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);

  const [memberModal, setMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: "", role: "fils", emoji: "👦", color: "#3DD6C8", birth_date: "", phone: "" });

  const [contactModal, setContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", phone: "", relation: "Ami(e)" });

  const [addressModal, setAddressModal] = useState(false);
  const [addressForm, setAddressForm] = useState({ name: "", emoji: "🏠", address: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [nominatimResults, setNominatimResults] = useState<{ display_name: string; lat: string; lon: string }[]>([]);

  useEffect(() => {
    if (searchQuery.length < 3) { setNominatimResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&countrycodes=fr&limit=5`, { headers: { "User-Agent": "FlowTime/1.0" } });
        setNominatimResults(await res.json());
      } catch { setNominatimResults([]); }
    }, 500);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function addContact() {
    if (!profile?.family_id || !contactForm.name.trim()) return;
    await supabase.from("contacts").insert({
      family_id: profile.family_id,
      name: contactForm.name,
      phone: contactForm.phone,
      relation: contactForm.relation,
      emoji: CONTACT_EMOJIS[contactForm.relation] || "🫂",
    });
    setContactModal(false);
    setContactForm({ name: "", phone: "", relation: "Ami(e)" });
  }

  async function addAddress() {
    if (!profile?.family_id || !addressForm.name.trim()) return;
    const selected = nominatimResults.find((r) => r.display_name === addressForm.address);
    await supabase.from("addresses").insert({
      family_id: profile.family_id,
      name: addressForm.name,
      emoji: addressForm.emoji,
      address: addressForm.address,
      lat: selected ? parseFloat(selected.lat) : null,
      lng: selected ? parseFloat(selected.lon) : null,
    });
    setAddressModal(false);
    setAddressForm({ name: "", emoji: "🏠", address: "" });
    setSearchQuery("");
    setNominatimResults([]);
  }

  async function addMember() {
    if (!profile?.family_id || !memberForm.name.trim()) return;
    const { data: inserted } = await supabase.from("members").insert({
      family_id: profile.family_id,
      name: memberForm.name,
      role: memberForm.role,
      emoji: memberForm.emoji,
      color: memberForm.color,
      birth_date: memberForm.birth_date || null,
      phone: memberForm.phone || null,
    }).select("id").single();
    if (inserted && memberForm.birth_date) {
      await supabase.from("birthdays").insert({ family_id: profile.family_id, name: memberForm.name, date: memberForm.birth_date, emoji: memberForm.emoji, member_id: inserted.id });
    }
    setMemberModal(false);
    setMemberForm({ name: "", role: "fils", emoji: "👦", color: "#3DD6C8", birth_date: "", phone: "" });
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    await supabase.from("profiles").update({
      first_name: firstName,
      last_name: lastName,
      phone,
      emoji,
      birth_date: birthDate || null,
    }).eq("id", profile.id);

    // Sync birth_date and phone to linked member record
    if (profile.family_id) {
      const updates: Record<string, unknown> = { phone: phone || null, birth_date: birthDate || null };
      await supabase.from("members").update(updates)
        .eq("family_id", profile.family_id)
        .eq("user_id", profile.id);

      // Sync linked birthday entry
      if (birthDate) {
        const { data: linkedMember } = await supabase
          .from("members")
          .select("id")
          .eq("family_id", profile.family_id)
          .eq("user_id", profile.id)
          .maybeSingle();
        if (linkedMember) {
          const { data: existingBday } = await supabase
            .from("birthdays")
            .select("id")
            .eq("member_id", linkedMember.id)
            .maybeSingle();
          if (existingBday) {
            await supabase.from("birthdays").update({ date: birthDate, name: firstName, emoji }).eq("id", existingBday.id);
          } else {
            await supabase.from("birthdays").insert({ family_id: profile.family_id, name: firstName, date: birthDate, emoji, member_id: linkedMember.id });
          }
        }
      }
    }

    await refreshProfile();
    setSaving(false);
  }

  async function toggleGeo() {
    if (!profile) return;
    if (!geoEnabled) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await supabase.from("profiles").update({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }).eq("id", profile.id);
          setGeoEnabled(true);
          refreshProfile();
        },
        () => alert("Impossible d'accéder à la géolocalisation")
      );
    } else {
      await supabase.from("profiles").update({ lat: null, lng: null }).eq("id", profile.id);
      setGeoEnabled(false);
      refreshProfile();
    }
  }

  async function changePassword() {
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 8) return setPasswordError("Minimum 8 caractères");
    if (newPassword !== confirmPassword) return setPasswordError("Les mots de passe ne correspondent pas");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return setPasswordError(error.message);
    setPasswordSuccess("Mot de passe modifié !");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function deleteAccount() {
    if (deleteConfirm !== "SUPPRIMER") return;
    if (!profile) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });
      if (!res.ok) {
        alert("Erreur lors de la suppression");
        return;
      }
    } catch {
      alert("Erreur lors de la suppression");
      return;
    }
    await supabase.auth.signOut();
    router.push("/");
  }

  function getMyFamilyCode() {
    return profile?.family_id?.slice(0, 8).toUpperCase() || "";
  }

  function copyFamilyCode() {
    navigator.clipboard.writeText(getMyFamilyCode());
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 3000);
  }

  const [joinLoading, setJoinLoading] = useState(false);

  async function joinFamily() {
    setJoinError("");
    setJoinSuccess("");
    if (!profile || !joinCode.trim() || joinLoading) return;
    setJoinLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setJoinLoading(false); return setJoinError("Session expirée, reconnecte-toi."); }

    const res = await fetch("/api/family/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ code: joinCode.trim() }),
    });

    const result = await res.json();

    if (!res.ok) {
      setJoinLoading(false);
      return setJoinError(result.error || "Erreur inconnue");
    }

    setJoinSuccess("Tu as rejoint la famille ! Tu as été ajouté comme membre.");
    setJoinCode("");
    setJoinLoading(false);
    refreshProfile();
    // Auto-reload after 2s to refresh all data
    setTimeout(() => window.location.reload(), 2000);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="px-4 py-4 animate-in gradient-bg" style={{ paddingBottom: 80 }}>
      <h1 className="text-xl font-bold mb-6">Réglages</h1>

      {/* Profil */}
      <Section title="Mon profil" emoji="👤" defaultOpen>
      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <AvatarUpload
            userId={profile?.id || ""}
            currentUrl={profile?.avatar_url}
            emoji={emoji}
            onUploaded={() => refreshProfile()}
            size={60}
          />
          <div>
            <p className="font-bold">{firstName} {lastName}</p>
            <p className="text-xs" style={{ color: "var(--dim)" }}>{profile?.email}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <input placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          <input value={profile?.email || ""} readOnly style={{ opacity: 0.5, cursor: "not-allowed" }} />
          <input placeholder="Téléphone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div>
            <p className="text-[11px] font-bold mb-1" style={{ color: "var(--dim)" }}>Date de naissance</p>
            <input
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              style={{ colorScheme: "dark", minHeight: 44 }}
              placeholder="JJ/MM/AAAA"
            />
          </div>
          <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
            {saving ? "Sauvegarde..." : "Sauvegarder les modifications"}
          </button>
        </div>
      </div>
      </Section>

      {/* Apparence */}
      <Section title="Apparence" emoji="🎨">
      <div className="card">
        <p className="text-sm font-bold mb-3">Thème</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["dark", "🌙", "Sombre"],
            ["light", "☀️", "Clair"],
            ["system", "💻", "Système"],
          ] as const).map(([key, icon, label]) => (
            <button
              key={key}
              className="py-2.5 rounded-xl text-xs font-bold transition-colors text-center"
              style={{
                background: theme === key ? "var(--accent)" : "var(--surface2)",
                color: theme === key ? "#fff" : "var(--text)",
              }}
              onClick={() => changeTheme(key)}
            >
              {icon} {label}
            </button>
          ))}
        </div>
        <p className="text-sm font-bold mb-3 mt-4">Couleur d&apos;accent</p>
        {(() => {
          const plan = profile?.subscription_status === "active" ? profile?.subscription_plan : "free";
          // Free: dark only (index 0), Plus: 10 first themes, Pro: all 30
          const allPalettes: [string, string, boolean][] = [
            ["dark", "#7C6BF0", false],
            ["p1", "#4A9EF0", false], ["p2", "#4CAF50", false], ["p3", "#F07C4A", false], ["p4", "#E04069", false],
            ["p5", "#A182E0", false], ["p6", "#3860B0", false], ["p7", "#DAA532", false], ["p8", "#88A8C2", false],
            ["p9", "#DB8EB0", false],
            ["p10", "#40CEC4", false], ["p11", "#F06262", false], ["p12", "#9CCC3C", false],
            ["p13", "#5C4ECC", false], ["p14", "#C48248", false], ["p15", "#C83CC8", false], ["p16", "#60B4F0", false],
            ["p17", "#34C484", false], ["p18", "#94A3B8", false], ["p19", "#A03048", false],
            ["p21", "#1A1A2E", true], ["p22", "#FF6B6B", true], ["p23", "#4ECDC4", true], ["p24", "#2D1B69", true],
            ["p25", "#F8B500", true], ["p26", "#0D7377", true], ["p27", "#FC5185", true], ["p28", "#3A0CA3", true],
            ["p29", "#B8D12A", true], ["p30", "#E63946", true],
          ];
          const maxThemes = plan === "pro" ? 30 : plan === "plus" ? 10 : 1;
          return (
            <div className="relative">
              <div className="flex flex-wrap gap-2.5 justify-center">
                {allPalettes.map(([key, color, exclusive], i) => {
                  const locked = i >= maxThemes;
                  return (
                    <button
                      key={key}
                      className="w-8 h-8 rounded-full transition-all relative"
                      style={{
                        background: color,
                        boxShadow: theme === key ? `0 0 0 3px var(--bg), 0 0 0 5px ${color}` : "none",
                        transform: theme === key ? "scale(1.15)" : "scale(1)",
                        opacity: locked ? 0.3 : 1,
                      }}
                      onClick={() => {
                        if (locked) { router.push("/abonnement"); return; }
                        changeTheme(key);
                      }}
                      aria-label={`Palette ${key}${exclusive ? " (exclusif)" : ""}`}
                    >
                      {exclusive && !locked && <span className="absolute -top-1 -right-1 text-[8px]">✦</span>}
                    </button>
                  );
                })}
              </div>
              {maxThemes < 30 && (
                <p className="text-center text-[10px] mt-2" style={{ color: "var(--dim)" }}>
                  🔒 {maxThemes === 1 ? "Thèmes disponibles avec FlowTime+" : "Plus de thèmes avec FlowTime Pro"}
                </p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Langue */}
      <div className="card">
        <p className="text-sm font-bold mb-3">Langue</p>
        <div className="flex gap-2">
          {([["fr", "🇫🇷", "Français"], ["en", "🇬🇧", "English"]] as const).map(([key, flag, label]) => (
            <button
              key={key}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors text-center"
              style={{
                background: lang === key ? "var(--accent)" : "var(--surface2)",
                color: lang === key ? "#fff" : "var(--text)",
              }}
              onClick={() => changeLang(key)}
            >
              {flag} {label}
            </button>
          ))}
        </div>
      </div>
      </Section>

      {/* Géolocalisation */}
      <Section title="Géolocalisation" emoji="📍">
      <div className="card flex items-center justify-between">
        <span className="text-sm">Permettre à Flow de me géolocaliser</span>
        <button
          className="w-12 h-7 rounded-full relative transition-colors"
          style={{ background: geoEnabled ? "var(--accent)" : "var(--surface2)" }}
          onClick={toggleGeo}
        >
          <span
            className="absolute w-5 h-5 rounded-full bg-white top-1 transition-all"
            style={{ left: geoEnabled ? 26 : 4 }}
          />
        </button>
      </div>
      </Section>

      {/* Notifications push */}
      <Section title="Notifications" emoji="🔔">
      <div className="card flex items-center justify-between">
        <div>
          <span className="text-sm">Notifications push</span>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--dim)" }}>
            Rappels matin & soir, alertes évènements
          </p>
        </div>
        <button
          className="w-12 h-7 rounded-full relative transition-colors"
          style={{ background: pushEnabled ? "var(--accent)" : "var(--surface2)", opacity: pushLoading ? 0.5 : 1 }}
          onClick={togglePush}
          disabled={pushLoading}
        >
          <span
            className="absolute w-5 h-5 rounded-full bg-white top-1 transition-all"
            style={{ left: pushEnabled ? 26 : 4 }}
          />
        </button>
      </div>
      {pushEnabled && (
        <button
          className="btn btn-secondary mt-2"
          onClick={async () => {
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const headers: Record<string, string> = { "Content-Type": "application/json" };
              if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

              // Step 1: Re-subscribe to make sure subscription is saved
              const reg = await navigator.serviceWorker.ready;
              const sub = await reg.pushManager.getSubscription();
              if (sub) {
                const subRes = await fetch("/api/push/subscribe", {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ subscription: sub.toJSON() }),
                });
                const subData = await subRes.json();
                if (subData.error) {
                  alert("Erreur subscribe: " + subData.error);
                  return;
                }
              } else {
                alert("Pas d'abonnement push actif. Désactive et réactive les notifications.");
                return;
              }

              // Step 2: Send test notification
              const res = await fetch("/api/push/send", {
                method: "POST",
                headers,
                body: JSON.stringify({
                  title: "FlowTime fonctionne ! 🎉",
                  body: `Hey ${profile?.first_name || ""} ! Les notifications sont bien activées. Tu recevras tes rappels même écran verrouillé 🔔`,
                  userId: profile?.id,
                }),
              });
              const data = await res.json();
              if (data.error) {
                alert("Erreur send: " + data.error);
              } else if (data.sent > 0) {
                alert("Notification envoyée ! Verrouille ton écran pour vérifier.");
              } else {
                alert("Aucun abonnement trouve en base. Erreur cote serveur.");
              }
            } catch (err) {
              alert("Erreur: " + (err instanceof Error ? err.message : String(err)));
            }
          }}
        >
          Tester les notifications
        </button>
      )}
      </Section>

      {/* Famille */}
      <Section title="Famille" emoji="👨‍👩‍👧‍👦" forceOpen={tutorialActive && currentSection === "reglages"}>
      <div className="card" data-tutorial="family-code">
        <p className="text-sm font-bold mb-1">Mon code famille</p>
        <p className="text-[11px] mb-3" style={{ color: "var(--dim)" }}>
          Partage ce code pour que tes proches rejoignent ta famille
        </p>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="flex-1 text-center py-3 rounded-xl font-extrabold text-lg tracking-[4px]"
            style={{ background: "var(--surface2)", color: "var(--accent)", fontFamily: "monospace" }}
          >
            {getMyFamilyCode()}
          </div>
          <button
            className="btn btn-secondary !w-auto !px-4 !py-3"
            onClick={copyFamilyCode}
          >
            {codeCopied ? "✓" : "📋"}
          </button>
        </div>
        {/* QR Code */}
        {getMyFamilyCode() && (
          <div className="flex flex-col items-center gap-3 mb-3">
            <div className="p-3 rounded-xl" style={{ background: "#fff" }}>
              <QRCodeSVG
                value={`https://flowtimeapp.vercel.app/join?code=${getMyFamilyCode()}`}
                size={140}
                level="M"
              />
            </div>
            <p className="text-[10px] text-center" style={{ color: "var(--faint)" }}>
              Scanne ce QR code pour rejoindre la famille
            </p>
            <button
              className="btn btn-secondary text-xs w-full"
              onClick={async () => {
                const url = `https://flowtimeapp.vercel.app/join?code=${getMyFamilyCode()}`;
                const shareData = {
                  title: "Rejoins ma famille sur FlowTime !",
                  text: `Utilise ce lien pour rejoindre ma famille sur FlowTime : ${url}`,
                  url,
                };
                if (navigator.share) {
                  try {
                    await navigator.share(shareData);
                  } catch {
                    // User cancelled
                  }
                } else {
                  await navigator.clipboard.writeText(url);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 3000);
                }
              }}
            >
              Partager le lien d&apos;invitation
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-3">
          <button className="btn btn-primary text-xs" onClick={() => setMemberModal(true)}>＋ Ajouter un membre</button>
          <button className="btn btn-secondary text-xs" onClick={() => setContactModal(true)}>＋ Ajouter un contact de confiance</button>
          <button className="btn btn-secondary text-xs" onClick={() => setAddressModal(true)}>＋ Ajouter une adresse</button>
          <button className="btn btn-secondary text-xs" onClick={() => setFamilyModal(true)}>Rejoindre une autre famille</button>
        </div>
      </div>
      </Section>

      {/* Sécurité */}
      <Section title="Sécurité" emoji="🔒">
      <div className="flex flex-col gap-2">
        <button className="btn btn-secondary" onClick={() => setPasswordModal(true)}>Changer le mot de passe</button>
        <button className="btn btn-danger" onClick={() => setDeleteModal(true)}>Supprimer mon compte</button>
      </div>
      </Section>

      {/* Abonnement */}
      <Section title="Abonnement" emoji="💎">
      <div className="flex flex-col gap-2">
        {(() => {
          const currentPlan = profile?.subscription_plan || "free";
          const isActive = profile?.subscription_status === "active";
          const planLabel = currentPlan === "pro" ? "👑 FlowTime Pro" : currentPlan === "plus" ? "⚡ FlowTime+" : "🌱 Gratuit";
          const periodEnd = profile?.subscription_period_end
            ? new Date(profile.subscription_period_end).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
            : null;
          return (
            <div className="card" style={{ border: `1.5px solid ${isActive && currentPlan !== "free" ? "var(--accent)" : "var(--green)"}` }}>
              <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-sm">{planLabel}</p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: isActive && currentPlan !== "free" ? "var(--accent)" : "var(--green)", color: "#fff" }}>Actuel</span>
              </div>
              {periodEnd && isActive && <p className="text-[10px] mb-1" style={{ color: "var(--dim)" }}>Renouvellement le {periodEnd}</p>}
              <button
                className="w-full mt-2 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: "var(--accent)", color: "#fff" }}
                onClick={() => router.push("/abonnement")}
              >
                {isActive && currentPlan !== "free" ? "Gérer mon abonnement" : "Voir les offres"}
              </button>
            </div>
          );
        })()}
      </div>
      </Section>

      {/* Aide */}
      <Section title="Aide" emoji="❓">
      <div className="card">
        <p className="text-sm font-bold mb-1">Tutoriel complet</p>
        <p className="text-[11px] mb-3" style={{ color: "var(--dim)" }}>
          Redécouvre FlowTime pas à pas
        </p>
        <button className="btn btn-primary text-xs" onClick={startTutorial}>
          Lancer le tutoriel
        </button>
      </div>

      <div className="card !p-0 overflow-hidden mt-2">
        {[
          { id: "accueil", emoji: "\u{1F3E0}", label: "Accueil", steps: 4 },
          { id: "famille", emoji: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", label: "Famille", steps: 3 },
          { id: "vie", emoji: "\u{1F4CC}", label: "Vie", steps: 2 },
          { id: "reglages", emoji: "\u2699\uFE0F", label: "Réglages", steps: 2 },
        ].map((sec, i, arr) => (
          <button
            key={sec.id}
            className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[rgba(255,255,255,0.03)] transition-colors"
            style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--glass-border)" : "none" }}
            onClick={() => startTutorialAtSection(sec.id)}
          >
            <span className="text-lg">{sec.emoji}</span>
            <div className="flex-1">
              <p className="text-sm font-bold">{sec.label}</p>
              <p className="text-[10px]" style={{ color: "var(--dim)" }}>{sec.steps} étapes</p>
            </div>
            {completedSections.includes(sec.id) && (
              <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>✓</span>
            )}
            <span className="text-xs" style={{ color: "var(--faint)" }}>›</span>
          </button>
        ))}
      </div>

      {/* FAQ */}
      <div className="card">
        <p className="text-sm font-bold mb-3">Questions fréquentes</p>
        {[
          { q: "Comment inviter un proche dans ma famille ?", a: "Va dans Famille > copie le code famille (en bas de page) et envoie-le. L'autre personne choisit « Rejoindre une famille » à l'inscription avec ce code." },
          { q: "Comment lier mon compte à un membre ?", a: "Va dans Famille > clique sur un membre > bouton « C'est moi ». Les rôles des autres membres s'adapteront à ton point de vue." },
          { q: "Comment ajouter un évènement récurrent ?", a: "Crée un évènement, puis active l'option « Récurrence » pour choisir les jours et horaires de répétition." },
          { q: "À quoi sert l'assistant Flow ?", a: "Flow est un assistant intelligent qui peut créer, modifier et supprimer des évènements par simple conversation. Tape par exemple « Ajoute un cours de piano mercredi à 14h »." },
          { q: "Mes données sont-elles sécurisées ?", a: "Oui. Chaque famille a un espace isolé. Seuls les membres de ta famille peuvent voir les données partagées. Les contacts et adresses peuvent être rendus « personnels »." },
          { q: "Comment partager ma position ?", a: "Va dans Famille > active « Partager ma position ». Ta localisation sera visible en temps réel par les membres de ta famille sur la carte." },
          { q: "Comment fonctionne le bien-être ?", a: "Va dans Bien-être pour accéder à 6 activités : méditation, respiration, yoga, étirements, marche et gratitude. Chaque session est enregistrée dans ton historique." },
        ].map((item, i) => (
          <details key={i} className="mb-2 group">
            <summary className="text-xs font-bold cursor-pointer py-2 flex items-center gap-2" style={{ color: "var(--text)" }}>
              <span className="text-[10px] transition-transform group-open:rotate-90" style={{ color: "var(--accent)" }}>▶</span>
              {item.q}
            </summary>
            <p className="text-[11px] pl-5 pb-2" style={{ color: "var(--dim)" }}>{item.a}</p>
          </details>
        ))}
      </div>

      {/* Astuces */}
      <div className="card">
        <p className="text-sm font-bold mb-3">Astuces</p>
        <div className="flex flex-col gap-2.5">
          {[
            { emoji: "💬", tip: "Demande à Flow de gérer ton planning : « Déplace mon rdv de lundi à mardi » ou « Supprime le cours de sport »." },
            { emoji: "🔔", tip: "Active les notifications push dans Réglages pour ne jamais manquer un évènement ou un message." },
            { emoji: "🗺️", tip: "Sur la carte, appuie longtemps pour déplacer une adresse. Utilise le bouton GPS pour te localiser." },
            { emoji: "🔍", tip: "La recherche (loupe) trouve tout : évènements, contacts, notes, repas, et même la météo." },
            { emoji: "📋", tip: "Dans les notes, utilise les checklists pour créer des to-do lists partagées avec ta famille." },
            { emoji: "🎂", tip: "Les anniversaires sont automatiquement créés depuis les dates de naissance des membres." },
            { emoji: "🔒", tip: "Tu peux rendre un contact ou une adresse « personnel » pour que seul toi puisse le voir." },
          ].map((item, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <span className="text-base shrink-0">{item.emoji}</span>
              <p className="text-[11px]" style={{ color: "var(--dim)" }}>{item.tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Raccourcis clavier / gestes */}
      <div className="card">
        <p className="text-sm font-bold mb-3">Gestes & navigation</p>
        <div className="flex flex-col gap-2">
          {[
            { gesture: "Glisser le carrousel", desc: "Changer de jour sur le planning" },
            { gesture: "Appuyer sur la carte", desc: "Ouvrir la carte en plein écran" },
            { gesture: "Appui long sur un membre", desc: "Modifier ses informations" },
            { gesture: "Tirer vers le bas", desc: "Rafraîchir les données" },
            { gesture: "Barre de recherche", desc: "Accès rapide à tout le contenu" },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg shrink-0" style={{ background: "var(--surface2)" }}>{item.gesture}</span>
              <span className="text-[11px]" style={{ color: "var(--dim)" }}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="card">
        <p className="text-sm font-bold mb-1">Un problème ? Une suggestion ?</p>
        <p className="text-[11px] mb-3" style={{ color: "var(--dim)" }}>
          N&apos;hésite pas à nous contacter, on répond vite !
        </p>
        <a href="mailto:support@flowtime.app" className="btn btn-secondary text-xs inline-block text-center">
          Envoyer un email
        </a>
      </div>
      </Section>

      {/* Nouveautés */}
      <Section title="Nouveautés" emoji="🆕">
      <div className="flex flex-col gap-2">
        {[
          {
            version: "2.7.0", date: "7 mars 2026", tag: "Nouveau",
            changes: [
              "Documents familiaux : stockez vos cartes vitales, CNI, passeports, mutuelles, assurances scolaires... avec photos",
              "14 types de documents proposés, filtre par membre, vue plein écran",
            ],
          },
          {
            version: "2.6.0", date: "7 mars 2026", tag: "Enfants",
            changes: [
              "Routines matin/soir pour enfants : étapes avec timer et validation automatique",
              "Tap sur une étape pour lancer le compte à rebours, auto-validé à la fin",
              "Barre de progression par routine, reset quotidien",
            ],
          },
          {
            version: "2.5.0", date: "7 mars 2026", tag: "Flow IA",
            changes: [
              "Flow widget : messages proactifs générés par l'IA (remplace les messages codés en dur)",
              "Météo intégrée dans le widget Flow (widget météo séparé supprimé)",
              "Ajout d'événements simplifié : plus de popup de confirmation, mode perso/famille automatique",
              "Flow peut changer la visibilité d'un événement (perso ↔ famille) sur demande",
              "Widgets budget et photos retirés de l'app",
            ],
          },
          {
            version: "2.4.0", date: "5 mars 2026", tag: "UX",
            changes: [
              "Tâches ménagères : checklist cochable avec compteur, tâches faites barrées",
              "Activité récente : sections groupées (événements, tâches, dépenses) avec compteurs",
              "Chat famille : photos de profil affichées à côté des messages",
            ],
          },
          {
            version: "2.3.0", date: "5 mars 2026", tag: "Carte",
            changes: [
              "Carte : tap sur une adresse ou un appareil pour zoomer dessus",
              "Tracking GPS haute précision en continu (watchPosition, maximumAge: 0)",
              "Positions des membres mises à jour en temps réel sur la carte (Supabase Realtime)",
              "Mini-carte interactive dans le modal d'adresse pour placer le marqueur précisément",
              "Correction de la carte qui sautait à chaque interaction",
            ],
          },
          {
            version: "2.2.0", date: "5 mars 2026", tag: "Widgets",
            changes: [
              "Widgets interactifs : tap pour ouvrir une vue détaillée",
              "Météo étendue : prévisions 7 jours (min/max, précipitations, vent, lever/coucher soleil)",
              "Activité : historique complet scrollable (événements, tâches, dépenses)",
              "Dépenses : toutes les catégories avec barres de progression + dernières transactions",
              "Anniversaires : liste complète regroupée par mois avec âge et compte à rebours",
            ],
          },
          {
            version: "2.1.0", date: "5 mars 2026", tag: "Contacts",
            changes: [
              "Attribution des contacts partagés à des membres (« De 👦 Erwan, 👨 Thibault »)",
              "Landing page marketing avec présentation des fonctionnalités",
              "Page de connexion séparée",
              "QR code d'invitation famille + bouton partager",
              "Page /join pour rejoindre une famille par lien",
              "Tous les rôles familiaux ajoutés (frère, sœur, conjoint, belle-famille, etc.)",
              "Rôles manuels (plus d'adaptation automatique)",
              "Correction événements grisés sur jours futurs",
              "Correction événements personnels visibles dans Famille",
              "Vocal rapide : arrêt du micro au re-tap",
            ],
          },
          {
            version: "2.0.0", date: "5 mars 2026", tag: "Famille",
            changes: [
              "Bouton « C'est moi » pour lier son compte à un membre",
              "Nouveaux rôles : beau-père, belle-mère, oncle, tante, cousin(e), neveu, nièce",
              "Synchronisation automatique des anniversaires depuis les dates de naissance des membres",
              "Connexion Google (OAuth)",
            ],
          },
          {
            version: "1.9.0", date: "4 mars 2026", tag: "Nouveau",
            changes: [
              "Tutoriel interactif avec spotlight sur les éléments clés",
              "Guide pas à pas cross-page (10 étapes)",
              "Section Aide dans les Réglages",
            ],
          },
          {
            version: "1.8.0", date: "4 mars 2026", tag: "Multi-famille",
            changes: [
              "Système multi-famille : rejoindre une famille avec un code",
              "Création automatique de membre à la jointure",
              "Contacts de confiance : visibilité Famille / Personnel",
              "Adresses : visibilité Famille / Personnel",
              "Synchronisation temps réel sur toutes les pages",
              "Rafraîchissement auto toutes les 10s",
              "Chat famille disponible sur toutes les pages",
              "Badge messages non lus sur l'icône Accueil",
              "Notifications web + vibration pour les messages",
              "Masquer son propre profil dans la liste des membres",
              "Horloge en direct + carrousel de dates synchronisé",
              "Correction bug de date (fuseau horaire UTC)",
              "Correction photo lightbox sur iPhone",
              "Réinitialisation mot de passe corrigée",
            ],
          },
          {
            version: "1.7.0", date: "4 mars 2026", tag: "Nouveau",
            changes: [
              "Notifications toast (remplace les alertes)",
              "Chat famille en temps réel (Supabase Broadcast)",
              "Récurrence d'évènements (quotidien, hebdo, mensuel)",
              "Détection de conflits horaires à la création",
              "Annuler une suppression (undo sur évènements et notes)",
              "Fil d'activité récente sur l'accueil",
              "Répartition des dépenses (qui doit combien à qui)",
              "Surlignage du texte recherché dans les résultats",
              "Transitions de page fluides",
              "États vides améliorés avec composant réutilisable",
              "Accessibilité : aria-labels sur les boutons",
              "Accents français corrigés dans toute l'application",
            ],
          },
          {
            version: "1.6.0", date: "4 mars 2026", tag: "Recherche",
            changes: [
              "Recherche améliorée (repas, tâches, contenu des notes)",
              "Recherches récentes sauvegardées",
              "Actions rapides (créer évènement, contact, note, tâche)",
              "Évènements à venir dans la recherche",
              "Anniversaires proches dans la recherche",
              "Widget météo dans la recherche",
              "Navigation directe vers la date d'un évènement",
            ],
          },
          {
            version: "1.5.0", date: "4 mars 2025", tag: "Nouveau",
            changes: [
              "Recadrage photo de profil (repositionner, zoomer avant upload)",
              "Badge camera visible sur la photo de profil",
              "Calendrier en tourniquet : scroll horizontal libre jour par jour (60 jours)",
              "Animations modals fluides (ouverture/fermeture sans flicker)",
              "Fermeture des modals par croix ou tap sur le fond",
            ],
          },
          {
            version: "1.4.0", date: "4 mars 2025", tag: "UX",
            changes: [
              "Refonte des contacts de confiance (50+ relations, 6 categories, appel rapide)",
              "Tâches cochables depuis l'accueil",
              "Historique Flow conserve entre ouverture/fermeture",
              "Skeletons de chargement",
              "Feedback tactile sur les cartes et boutons",
              "Logo et boutons adaptes au theme choisi",
              "Bouton vocal plus visible et theme-aware",
              "Avatar cliquable vers les reglages",
              "Mot de passe oublie sur la page login",
              "Export PDF sans quitter l'application",
            ],
          },
          {
            version: "1.3.0", date: "3 mars 2025", tag: "Sécurité",
            changes: [
              "Sécurisation de toutes les routes API (authentification)",
              "Headers de securite (CSP, HSTS, X-Frame-Options)",
              "Rate limiting sur les APIs sensibles",
              "Correction des politiques RLS Supabase",
              "Validation des inputs sur l'API Flow",
              "Protection CRON avec secret",
            ],
          },
          {
            version: "1.2.0", date: "2 mars 2025", tag: "Notifications",
            changes: [
              "Notifications push iOS/Android",
              "Résumé matinal à 7h avec le programme du jour",
              "Rappels 15 min avant chaque évènement",
              "Notifications meme app fermee (Service Worker)",
              "Emojis et messages personnalisés par catégorie",
              "Bouton tester les notifications dans les reglages",
            ],
          },
          {
            version: "1.1.0", date: "1 mars 2025", tag: "Cartes",
            changes: [
              "Carte interactive multi-couches (Sombre, Standard, Satellite)",
              "Itinéraires gratuits (voiture, marche, vélo)",
              "Recherche POI (12 catégories)",
              "Localisation GPS en temps reel",
              "Partage de position entre appareils",
              "Widget carte sur l'accueil",
            ],
          },
          {
            version: "1.0.0", date: "28 fevrier 2025", tag: "Lancement",
            changes: [
              "Planning familial avec Flow IA",
              "Gestion des membres, contacts, adresses",
              "Mode vocal et photo dans Flow",
              "Notes collaboratives avec commentaires",
              "Listes de courses partagées",
              "Suivi des dépenses et tâches ménagères",
              "5 themes (Sombre, Ocean, Foret, Coucher de soleil, Clair)",
              "Mode hors-ligne avec cache",
              "PWA installable sur mobile",
            ],
          },
        ].map((release) => (
          <details key={release.version} className="card !mb-0 group">
            <summary className="flex items-center justify-between cursor-pointer list-none">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">v{release.version}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                  background: release.tag === "Nouveau" ? "var(--accent-soft)" : release.tag === "Sécurité" ? "rgba(240,107,126,0.12)" : release.tag === "UX" ? "rgba(94,212,200,0.12)" : "rgba(94,200,158,0.12)",
                  color: release.tag === "Nouveau" ? "var(--accent)" : release.tag === "Sécurité" ? "var(--red)" : release.tag === "UX" ? "var(--teal)" : "var(--green)",
                }}>{release.tag}</span>
              </div>
              <span className="text-[10px]" style={{ color: "var(--dim)" }}>{release.date}</span>
            </summary>
            <ul className="mt-3 flex flex-col gap-1.5">
              {release.changes.map((c, i) => (
                <li key={i} className="text-xs flex gap-2" style={{ color: "var(--dim)" }}>
                  <span style={{ color: "var(--accent)" }}>•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      </Section>

      {/* A propos */}
      <Section title="A propos" emoji="ℹ️">
      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--accent), var(--teal))" }}>
            <span className="text-lg">🌊</span>
          </div>
          <div>
            <p className="font-bold text-sm">FlowTime</p>
            <p className="text-[10px]" style={{ color: "var(--dim)" }}>Version 2.4.0</p>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--dim)" }}>
          Votre famille, parfaitement synchronisée.
        </p>
        <p className="text-[10px] mt-2" style={{ color: "var(--faint)" }}>
          Fait avec 💜 par FlowTime Team
        </p>
      </div>
      </Section>

      {/* Déconnexion */}
      <button className="btn btn-danger mt-6 mb-4" onClick={signOut}>
        🚪 Se déconnecter
      </button>

      {/* MODALS */}
      <Modal open={emojiModal} onClose={() => setEmojiModal(false)} title="Choisir un avatar">
        <div className="flex flex-wrap gap-2">
          {PROFILE_EMOJIS.map((e) => (
            <button
              key={e}
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ background: emoji === e ? "var(--accent)" : "var(--surface2)" }}
              onClick={() => { setEmoji(e); setEmojiModal(false); }}
            >
              {e}
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={passwordModal} onClose={() => { setPasswordModal(false); setPasswordError(""); setPasswordSuccess(""); }} title="Changer le mot de passe">
        <div className="flex flex-col gap-3">
          {passwordError && <p className="text-xs font-bold" style={{ color: "var(--red)" }}>{passwordError}</p>}
          {passwordSuccess && <p className="text-xs font-bold" style={{ color: "var(--green)" }}>{passwordSuccess}</p>}
          <input type="password" placeholder="Nouveau mot de passe" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <input type="password" placeholder="Confirmer" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          <button className="btn btn-primary" onClick={changePassword}>Confirmer</button>
        </div>
      </Modal>

      <Modal open={familyModal} onClose={() => { setFamilyModal(false); setJoinError(""); setJoinSuccess(""); setJoinCode(""); }} title="Rejoindre une famille">
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--dim)" }}>
            Entre le code famille partagé par un proche pour rejoindre sa famille.
          </p>
          {joinError && <p className="text-xs font-bold" style={{ color: "var(--red)" }}>{joinError}</p>}
          {joinSuccess && <p className="text-xs font-bold" style={{ color: "var(--green)" }}>{joinSuccess}</p>}
          <input
            placeholder="Code famille (8 caractères)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={8}
            className="!text-center !text-lg !tracking-[4px] !font-extrabold"
            style={{ fontFamily: "monospace" }}
          />
          <button className="btn btn-primary" onClick={joinFamily} disabled={joinCode.length < 8 || joinLoading}>
            Rejoindre cette famille
          </button>
          <p className="text-[10px] text-center" style={{ color: "var(--faint)" }}>
            Attention : tu quitteras ta famille actuelle
          </p>
        </div>
      </Modal>

      <Modal open={deleteModal} onClose={() => { setDeleteModal(false); setDeleteConfirm(""); }} title="Supprimer mon compte">
        <p className="text-sm mb-3" style={{ color: "var(--red)" }}>
          Cette action est irréversible. Tapez <strong>SUPPRIMER</strong> pour confirmer.
        </p>
        <input placeholder="SUPPRIMER" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
        <button className="btn btn-danger mt-3" onClick={deleteAccount} disabled={deleteConfirm !== "SUPPRIMER"}>
          Confirmer la suppression
        </button>
      </Modal>

      {/* MODAL AJOUT MEMBRE */}
      <Modal open={memberModal} onClose={() => setMemberModal(false)} title="Nouveau membre">
        <div className="flex flex-col gap-3">
          <input placeholder="Prénom" value={memberForm.name} onChange={(e) => setMemberForm({ ...memberForm, name: e.target.value })} />
          <input placeholder="Téléphone (optionnel)" type="tel" value={memberForm.phone} onChange={(e) => setMemberForm({ ...memberForm, phone: e.target.value })} />
          <p className="label">Date de naissance</p>
          <input type="date" value={memberForm.birth_date} onChange={(e) => setMemberForm({ ...memberForm, birth_date: e.target.value })} />
          <p className="label">Rôle</p>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r.key}
                className="px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                style={{
                  background: memberForm.role === r.key ? "var(--accent)" : "var(--surface2)",
                  color: memberForm.role === r.key ? "#fff" : "var(--text)",
                }}
                onClick={() => setMemberForm({ ...memberForm, role: r.key, emoji: r.defaultEmoji })}
              >
                {r.defaultEmoji} {r.label}
              </button>
            ))}
          </div>
          <p className="label mt-2">Emoji</p>
          <div className="flex flex-wrap gap-2">
            {(ROLE_EMOJIS[memberForm.role] || ROLE_EMOJIS.autre).map((e) => (
              <button key={e} className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: memberForm.emoji === e ? "var(--accent)" : "var(--surface2)" }} onClick={() => setMemberForm({ ...memberForm, emoji: e })}>{e}</button>
            ))}
          </div>
          <p className="label mt-2">Couleur</p>
          <div className="flex gap-2">
            {MEMBER_COLORS.map((c) => (
              <button key={c} className="w-8 h-8 rounded-full" style={{ background: c, outline: memberForm.color === c ? "2px solid var(--text)" : "none", outlineOffset: 2 }} onClick={() => setMemberForm({ ...memberForm, color: c })} />
            ))}
          </div>
          <button className="btn btn-primary mt-3" onClick={addMember} disabled={!memberForm.name.trim()}>Ajouter</button>
        </div>
      </Modal>

      {/* MODAL AJOUT CONTACT */}
      <Modal open={contactModal} onClose={() => setContactModal(false)} title="Nouveau contact">
        <div className="flex flex-col gap-3">
          <input placeholder="Nom" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
          <input placeholder="Téléphone" type="tel" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
          <p className="label">Catégorie</p>
          <select value={contactForm.relation} onChange={(e) => setContactForm({ ...contactForm, relation: e.target.value })}>
            {Object.entries(CONTACT_CATEGORIES).map(([cat, relations]) => (
              <optgroup key={cat} label={`${CONTACT_EMOJIS[cat] || ""} ${cat}`}>
                {relations.map((r) => <option key={r} value={r}>{CONTACT_EMOJIS[r] || ""} {r}</option>)}
              </optgroup>
            ))}
          </select>
          <button className="btn btn-primary mt-3" onClick={addContact} disabled={!contactForm.name.trim()}>Ajouter</button>
        </div>
      </Modal>

      {/* MODAL AJOUT ADRESSE */}
      <Modal open={addressModal} onClose={() => setAddressModal(false)} title="Nouvelle adresse">
        <div className="flex flex-col gap-3">
          <input placeholder="Nom de l'adresse" value={addressForm.name} onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })} />
          <p className="label">Emoji</p>
          <div className="flex flex-wrap gap-2">
            {ADDRESS_EMOJIS.map((e) => (
              <button key={e} className="w-9 h-9 rounded-lg flex items-center justify-center text-lg" style={{ background: addressForm.emoji === e ? "var(--accent)" : "var(--surface2)" }} onClick={() => setAddressForm({ ...addressForm, emoji: e })}>{e}</button>
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
                    setAddressForm({ ...addressForm, address: r.display_name });
                    setSearchQuery("");
                    setNominatimResults([]);
                  }}
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
          {addressForm.address && (
            <p className="text-xs px-1" style={{ color: "var(--green)" }}>📍 {addressForm.address}</p>
          )}
          <button className="btn btn-primary mt-3" onClick={addAddress} disabled={!addressForm.name.trim()}>Ajouter</button>
        </div>
      </Modal>
    </div>
  );
}
