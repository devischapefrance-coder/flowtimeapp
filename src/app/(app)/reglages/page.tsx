"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../layout";
import Modal from "@/components/Modal";

const PROFILE_EMOJIS = ["👤","👨","👩","👦","👧","👶","👴","👵","🧑","🧔","👱","🧑‍🦰","🧑‍🦱","🧑‍🦳","🧑‍🦲","🐱","🐶","🦊","🐻","🐼"];

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

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div className="px-4 py-4 animate-in">
      <h1 className="text-xl font-extrabold mb-6">Réglages</h1>

      {/* Profil */}
      <p className="label">Mon profil</p>
      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <button
            className="w-[60px] h-[60px] flex items-center justify-center rounded-full text-3xl"
            style={{ background: "var(--surface2)" }}
            onClick={() => setEmojiModal(true)}
          >
            {emoji}
          </button>
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

      {/* Géolocalisation */}
      <p className="label mt-4">Géolocalisation</p>
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
