"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

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

        {/* Separator */}
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px" style={{ background: "var(--glass-border)" }} />
          <span className="text-[11px] font-bold" style={{ color: "var(--faint)" }}>ou continuer avec</span>
          <div className="flex-1 h-px" style={{ background: "var(--glass-border)" }} />
        </div>

        {/* Google OAuth */}
        <button
          type="button"
          className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl text-xs font-bold transition-colors"
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--glass-border)",
            color: "var(--text)",
          }}
          onClick={async () => {
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
            const { error: oauthError } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: `${siteUrl}/auth/callback` },
            });
            if (oauthError) setError(oauthError.message);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          S&apos;inscrire avec Google
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
