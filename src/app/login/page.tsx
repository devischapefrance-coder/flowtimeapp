"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setLoading(false);
      if (authError.message === "Invalid login credentials") {
        return setError("Email ou mot de passe incorrect");
      }
      return setError(authError.message);
    }

    router.push("/home");
  }

  return (
    <div className="min-h-dvh px-5 py-4 animate-in">
      <header className="flex items-center gap-3 mb-6">
        <Link href="/" className="flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: "var(--surface2)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 className="text-lg font-extrabold">Se connecter</h1>
      </header>

      <div className="text-center mb-8">
        <div className="text-[40px] mb-3">👋</div>
        <h2
          className="text-[22px] font-bold mb-1"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Bon retour !
        </h2>
        <p className="text-[13px]" style={{ color: "var(--dim)" }}>
          Connectez-vous à votre espace famille
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit(e)}
        />
        <button type="submit" className="btn btn-primary mt-2" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>

      <p className="text-center text-[13px] mt-6" style={{ color: "var(--dim)" }}>
        Pas encore inscrit ?{" "}
        <Link href="/signup" className="font-bold" style={{ color: "var(--accent)" }}>
          Créer un compte
        </Link>
      </p>
    </div>
  );
}
