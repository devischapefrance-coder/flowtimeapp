"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import Modal from "@/components/Modal";
import AvatarUpload from "@/components/AvatarUpload";
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from "@/lib/push";

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

  const [firstName, setFirstName] = useState(profile?.first_name || "");
  const [lastName, setLastName] = useState(profile?.last_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [address, setAddress] = useState(profile?.address || "");
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

  const [theme, setTheme] = useState<"dark" | "light" | "system">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("flowtime_theme") as "dark" | "light" | "system") || "dark";
    }
    return "dark";
  });
  const [lang, setLang] = useState<"fr" | "en">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("flowtime_lang") as "fr" | "en") || "fr";
    }
    return "fr";
  });

  function changeTheme(t: "dark" | "light" | "system") {
    setTheme(t);
    localStorage.setItem("flowtime_theme", t);
    let resolved = t;
    if (t === "system") {
      resolved = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    if (resolved === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
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

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);
    await supabase.from("profiles").update({
      first_name: firstName,
      last_name: lastName,
      phone,
      address,
      emoji,
    }).eq("id", profile.id);
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
    await supabase.from("profiles").delete().eq("id", profile.id);
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

  async function joinFamily() {
    setJoinError("");
    setJoinSuccess("");
    if (!profile || !joinCode.trim()) return;
    const code = joinCode.trim().toLowerCase();

    // Find a profile whose family_id starts with this code
    const { data } = await supabase
      .from("profiles")
      .select("family_id")
      .ilike("family_id", `${code}%`)
      .neq("id", profile.id)
      .limit(1);

    if (!data || data.length === 0) {
      return setJoinError("Code famille introuvable. Vérifie le code et réessaie.");
    }

    const targetFamilyId = data[0].family_id;

    // Update my profile to join this family
    await supabase.from("profiles").update({ family_id: targetFamilyId }).eq("id", profile.id);
    setJoinSuccess("Tu as rejoint la famille ! Recharge l'app pour voir les changements.");
    setJoinCode("");
    refreshProfile();
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="px-4 py-4 animate-in gradient-bg" style={{ paddingBottom: 100 }}>
      <h1 className="text-xl font-bold mb-6">Reglages</h1>

      {/* Profil */}
      <p className="label">Mon profil</p>
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
          <input placeholder="Adresse" value={address} onChange={(e) => setAddress(e.target.value)} />
          <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
            {saving ? "Sauvegarde..." : "Sauvegarder les modifications"}
          </button>
        </div>
      </div>

      {/* Apparence */}
      <p className="label mt-4">Apparence</p>
      <div className="card">
        <p className="text-sm font-bold mb-3">Theme</p>
        <div className="flex gap-2">
          {([["dark", "🌙", "Sombre"], ["light", "☀️", "Clair"], ["system", "💻", "Systeme"]] as const).map(([key, icon, label]) => (
            <button
              key={key}
              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors text-center"
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
      </div>

      {/* Langue */}
      <div className="card">
        <p className="text-sm font-bold mb-3">Langue</p>
        <div className="flex gap-2">
          {([["fr", "🇫🇷", "Francais"], ["en", "🇬🇧", "English"]] as const).map(([key, flag, label]) => (
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

      {/* Geolocalisation */}
      <p className="label mt-4">Geolocalisation</p>
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

      {/* Notifications push */}
      <p className="label mt-4">Notifications</p>
      <div className="card flex items-center justify-between">
        <div>
          <span className="text-sm">Notifications push</span>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--dim)" }}>
            Rappels matin & soir, alertes evenements
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

      {/* Famille */}
      <p className="label mt-4">Famille</p>
      <div className="card">
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
        <button className="btn btn-secondary text-xs" onClick={() => setFamilyModal(true)}>
          Rejoindre une autre famille
        </button>
      </div>

      {/* Sécurité */}
      <p className="label mt-4">Sécurité</p>
      <div className="flex flex-col gap-2">
        <button className="btn btn-secondary" onClick={() => setPasswordModal(true)}>Changer le mot de passe</button>
        <button className="btn btn-danger" onClick={() => setDeleteModal(true)}>Supprimer mon compte</button>
      </div>

      {/* Abonnement */}
      <p className="label mt-4">Abonnement</p>
      <div className="flex flex-col gap-2">
        <div className="card" style={{ border: "1.5px solid var(--green)" }}>
          <div className="flex items-center justify-between mb-1">
            <p className="font-bold text-sm">Gratuit</p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--green)", color: "#fff" }}>Actuel</span>
          </div>
          <p className="text-xs" style={{ color: "var(--dim)" }}>1 famille · 3 membres · 5 événements/jour</p>
        </div>
        <div className="card">
          <p className="font-bold text-sm">Premium <span style={{ color: "var(--accent)" }}>4.99€/mois</span></p>
          <p className="text-xs" style={{ color: "var(--dim)" }}>Illimité · Flow IA avancé · Sons ambiants</p>
        </div>
        <div className="card">
          <p className="font-bold text-sm">Famille <span style={{ color: "var(--accent)" }}>9.99€/mois</span></p>
          <p className="text-xs" style={{ color: "var(--dim)" }}>Multi-famille · Partage · Alertes proactives</p>
        </div>
      </div>

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
          <button className="btn btn-primary" onClick={joinFamily} disabled={joinCode.length < 8}>
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
    </div>
  );
}
