"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

function getPasswordScore(pw: string): number {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function getStrengthColor(score: number): string {
  if (score <= 1) return "var(--red)";
  if (score <= 3) return "var(--warm)";
  return "var(--green)";
}

const PROFILE_EMOJIS = [
  "👨","🧔","👱‍♂️","👨‍🦰","👨‍🦱","👨‍🦳","🧑‍🦲","🤴",
  "👩","👱‍♀️","👩‍🦰","👩‍🦱","👩‍🦳","👸",
  "👦","👧","🧒","🧑",
  "👶","👴","👵","🧑‍🍼",
  "🐱","🐶","🦊","🐻","🐼","🦁","🐸","🌟",
];

export default function SignupPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [emoji, setEmoji] = useState("👤");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const score = getPasswordScore(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!firstName.trim()) return setError("Le prénom est requis");
    if (!lastName.trim()) return setError("Le nom est requis");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return setError("Email invalide");
    if (!phone.trim()) return setError("Le téléphone est requis");
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
      return setError("Le mot de passe doit contenir au moins 8 caractères, 1 majuscule et 1 chiffre");
    if (password !== confirm)
      return setError("Les mots de passe ne correspondent pas");

    setLoading(true);
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName } },
    });

    if (authError) {
      setLoading(false);
      return setError(authError.message);
    }

    if (data.user) {
      await supabase.from("profiles").insert({
        id: data.user.id,
        email,
        first_name: firstName,
        last_name: lastName,
        phone,
        address,
        emoji,
      });
    }

    router.push("/home");
  }

  return (
    <div className="min-h-dvh px-5 py-4 animate-in" style={{ paddingTop: "max(16px, env(safe-area-inset-top, 16px))" }}>
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" className="flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: "var(--surface2)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-lg font-extrabold">Créer un compte</h1>
      </header>

      <div className="text-center mb-6">
        <div className="text-[40px] mb-2">✨</div>
        <p className="text-[13px]" style={{ color: "var(--dim)" }}>
          Remplissez vos informations pour commencer
        </p>
      </div>

      {error && (
        <div
          className="mb-4 p-3 rounded-xl text-xs font-bold text-center"
          style={{
            background: "rgba(255,107,107,0.1)",
            color: "var(--red)",
            border: "1px solid rgba(255,107,107,0.2)",
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <p className="label">Identité</p>
          <div className="flex flex-col gap-3">
            <input type="text" placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <input type="text" placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="label">Votre emoji</p>
          <div className="flex flex-wrap gap-2">
            {PROFILE_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all"
                style={{
                  background: emoji === e ? "var(--accent-soft)" : "var(--surface2)",
                  border: emoji === e ? "2px solid var(--accent)" : "2px solid transparent",
                }}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label">Coordonnées</p>
          <div className="flex flex-col gap-3">
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input type="tel" placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input type="text" placeholder="Adresse postale" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="label">Sécurité</p>
          <div className="flex flex-col gap-3">
            <div>
              <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
              {password && (
                <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.max(20, score * 20)}%`,
                      background: getStrengthColor(score),
                    }}
                  />
                </div>
              )}
            </div>
            <input type="password" placeholder="Confirmer le mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary mt-2" disabled={loading}>
          {loading ? "Création en cours..." : "Créer mon compte"}
        </button>
      </form>

      <p className="text-center text-[13px] mt-6" style={{ color: "var(--dim)" }}>
        Déjà inscrit ?{" "}
        <Link href="/" className="font-bold" style={{ color: "var(--accent)" }}>
          Se connecter
        </Link>
      </p>
    </div>
  );
}
