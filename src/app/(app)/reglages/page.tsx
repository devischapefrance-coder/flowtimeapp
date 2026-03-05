"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile, useTutorial } from "../layout";
import Modal from "@/components/Modal";
import AvatarUpload from "@/components/AvatarUpload";
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from "@/lib/push";
import { QRCodeSVG } from "qrcode.react";

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
  const { startTutorial } = useTutorial();

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

  const PALETTE_CLASSES = ["light","p1","p2","p3","p4","p5","p6","p7","p8","p9","p10","p11","p12","p13","p14","p15","p16","p17","p18","p19","p20"];

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

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setJoinError("Session expirée, reconnecte-toi.");

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
      return setJoinError(result.error || "Erreur inconnue");
    }

    setJoinSuccess("Tu as rejoint la famille ! Tu as été ajouté comme membre.");
    setJoinCode("");
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
        <div className="flex flex-wrap gap-2.5 justify-center">
          {([
            ["dark", "#7C6BF0"],
            ["p1", "#4A9EF0"], ["p2", "#4CAF50"], ["p3", "#F07C4A"], ["p4", "#E04069"],
            ["p5", "#A182E0"], ["p6", "#3860B0"], ["p7", "#DAA532"], ["p8", "#88A8C2"],
            ["p9", "#DB8EB0"], ["p10", "#40CEC4"], ["p11", "#F06262"], ["p12", "#9CCC3C"],
            ["p13", "#5C4ECC"], ["p14", "#C48248"], ["p15", "#C83CC8"], ["p16", "#60B4F0"],
            ["p17", "#34C484"], ["p18", "#94A3B8"], ["p19", "#A03048"], ["p20", "#8C3CF0"],
          ]).map(([key, color]) => (
            <button
              key={key}
              className="w-8 h-8 rounded-full transition-all"
              style={{
                background: color,
                boxShadow: theme === key ? `0 0 0 3px var(--bg), 0 0 0 5px ${color}` : "none",
                transform: theme === key ? "scale(1.15)" : "scale(1)",
              }}
              onClick={() => changeTheme(key)}
              aria-label={`Palette ${key}`}
            />
          ))}
        </div>
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

      {/* Notifications push */}
      <p className="label mt-4">Notifications</p>
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

      {/* Famille */}
      <p className="label mt-4">Famille</p>
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

      {/* Aide */}
      <p className="label mt-4">Aide</p>
      <div className="card">
        <p className="text-sm font-bold mb-1">Tutoriel interactif</p>
        <p className="text-[11px] mb-3" style={{ color: "var(--dim)" }}>
          Redécouvre les fonctionnalités principales de FlowTime avec un guide pas à pas.
        </p>
        <button className="btn btn-primary text-xs" onClick={startTutorial}>
          Lancer le tutoriel
        </button>
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

      {/* Nouveautés */}
      <p className="label mt-4">Nouveautés</p>
      <div className="flex flex-col gap-2">
        {[
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

      {/* A propos */}
      <p className="label mt-4">A propos</p>
      <div className="card">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--accent), var(--teal))" }}>
            <span className="text-lg">🌊</span>
          </div>
          <div>
            <p className="font-bold text-sm">FlowTime</p>
            <p className="text-[10px]" style={{ color: "var(--dim)" }}>Version 2.1.0</p>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--dim)" }}>
          Votre famille, parfaitement synchronisée.
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
