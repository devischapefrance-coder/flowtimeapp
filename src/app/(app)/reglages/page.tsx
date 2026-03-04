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

  const [theme, setTheme] = useState<"dark" | "light" | "system" | "ocean" | "forest" | "sunset">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("flowtime_theme") as "dark" | "light" | "system" | "ocean" | "forest" | "sunset") || "dark";
    }
    return "dark";
  });
  const [lang, setLang] = useState<"fr" | "en">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("flowtime_lang") as "fr" | "en") || "fr";
    }
    return "fr";
  });

  function changeTheme(t: "dark" | "light" | "system" | "ocean" | "forest" | "sunset") {
    setTheme(t);
    localStorage.setItem("flowtime_theme", t);
    const themeClasses = ["light", "ocean", "forest", "sunset"];
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
        <div className="grid grid-cols-3 gap-2">
          {([
            ["dark", "🌙", "Sombre"],
            ["light", "☀️", "Clair"],
            ["system", "💻", "Systeme"],
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
        <p className="text-sm font-bold mb-3 mt-4">Palettes</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["ocean", "#4A9EF0", "Ocean"],
            ["forest", "#4CAF50", "Foret"],
            ["sunset", "#F07C4A", "Sunset"],
          ] as const).map(([key, color, label]) => (
            <button
              key={key}
              className="py-2.5 rounded-xl text-xs font-bold transition-colors text-center flex items-center justify-center gap-1.5"
              style={{
                background: theme === key ? color : "var(--surface2)",
                color: theme === key ? "#fff" : "var(--text)",
                border: theme === key ? "none" : `1.5px solid ${color}30`,
              }}
              onClick={() => changeTheme(key)}
            >
              <span className="w-3 h-3 rounded-full" style={{ background: color }} />
              {label}
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
                alert("Pas d'abonnement push actif. Desactive et reactive les notifications.");
                return;
              }

              // Step 2: Send test notification
              const res = await fetch("/api/push/send", {
                method: "POST",
                headers,
                body: JSON.stringify({
                  title: "FlowTime fonctionne ! 🎉",
                  body: `Hey ${profile?.first_name || ""} ! Les notifications sont bien activees. Tu recevras tes rappels meme ecran verrouille 🔔`,
                  userId: profile?.id,
                }),
              });
              const data = await res.json();
              if (data.error) {
                alert("Erreur send: " + data.error);
              } else if (data.sent > 0) {
                alert("Notification envoyee ! Verrouille ton ecran pour verifier.");
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

      {/* Nouveautés */}
      <p className="label mt-4">Nouveautes</p>
      <div className="flex flex-col gap-2">
        {[
          {
            version: "1.4.0", date: "4 mars 2025", tag: "Nouveau",
            changes: [
              "Refonte des contacts de confiance (50+ relations, 6 categories, appel rapide)",
              "Swipe gauche/droite sur le calendrier",
              "Swipe vers le bas pour fermer les modals",
              "Taches cochables depuis l'accueil",
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
            version: "1.3.0", date: "3 mars 2025", tag: "Securite",
            changes: [
              "Securisation de toutes les routes API (authentification)",
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
              "Resume matinal a 7h avec le programme du jour",
              "Rappels 15 min avant chaque evenement",
              "Notifications meme app fermee (Service Worker)",
              "Emojis et messages personnalises par categorie",
              "Bouton tester les notifications dans les reglages",
            ],
          },
          {
            version: "1.1.0", date: "1 mars 2025", tag: "Cartes",
            changes: [
              "Carte interactive multi-couches (Sombre, Standard, Satellite)",
              "Itineraires gratuits (voiture, marche, velo)",
              "Recherche POI (12 categories)",
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
              "Listes de courses partagees",
              "Suivi des depenses et taches menageres",
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
                  background: release.tag === "Nouveau" ? "var(--accent-soft)" : release.tag === "Securite" ? "rgba(240,107,126,0.12)" : "rgba(94,200,158,0.12)",
                  color: release.tag === "Nouveau" ? "var(--accent)" : release.tag === "Securite" ? "var(--red)" : "var(--green)",
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

      {/* A propos */}
      <p className="label mt-4">A propos</p>
      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--accent), var(--teal))" }}>
            <span className="text-lg">🌊</span>
          </div>
          <div>
            <p className="font-bold text-sm">FlowTime</p>
            <p className="text-[10px]" style={{ color: "var(--dim)" }}>Version 1.4.0</p>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--dim)" }}>
          Votre famille, parfaitement synchronisee.
        </p>
        <p className="text-[10px] mt-2" style={{ color: "var(--faint)" }}>
          Fait avec 💜 par FlowTime Team
        </p>
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
