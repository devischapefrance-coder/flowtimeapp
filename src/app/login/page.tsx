"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [stayLogged, setStayLogged] = useState(true);

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Entre ton email d'abord");
      return;
    }
    setError("");
    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccess("Un email de réinitialisation a été envoyé !");
    }
  }

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

    if (!stayLogged) {
      localStorage.setItem("flowtime_session_only", "true");
    } else {
      localStorage.removeItem("flowtime_session_only");
    }
    router.push("/home");
  }

  return (
    <div
      className="flex flex-col items-center min-h-dvh px-6 animate-in gradient-bg"
      style={{
        paddingTop: "max(60px, env(safe-area-inset-top, 60px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Decorative orb */}
      <div
        className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(124,107,240,0.12) 0%, transparent 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      {/* Logo */}
      <div
        className="flex items-center justify-center relative"
        style={{
          width: 72,
          height: 72,
          borderRadius: 22,
          background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
          boxShadow: "0 8px 40px var(--accent-glow)",
        }}
      >
        <Logo size={44} />
      </div>

      {/* Title */}
      <h1
        className="mt-4 text-[28px] font-bold"
        style={{ fontFamily: "var(--font-fraunces), serif" }}
      >
        FlowTime
      </h1>
      <p className="mt-1 text-[13px]" style={{ color: "var(--dim)" }}>
        Connectez-vous a votre espace famille
      </p>

      {/* Glass card form */}
      <div
        className="glass w-full max-w-[340px] mt-8 p-6"
        style={{ borderRadius: "var(--radius)" }}
      >
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
        {success && (
          <div
            className="mb-4 p-3 rounded-xl text-xs font-bold text-center"
            style={{
              background: "rgba(94,200,158,0.1)",
              color: "var(--green)",
              border: "1px solid rgba(94,200,158,0.2)",
            }}
          >
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] font-bold uppercase block mb-1.5" style={{ color: "var(--dim)", letterSpacing: "0.05em" }}>
              Email
            </label>
            <input
              type="email"
              placeholder="votre@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ background: "var(--surface2)" }}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase block mb-1.5" style={{ color: "var(--dim)", letterSpacing: "0.05em" }}>
              Mot de passe
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit(e)}
              style={{ background: "var(--surface2)" }}
            />
          </div>

          <button
            type="button"
            className="text-[11px] font-bold self-end -mt-1"
            style={{ color: "var(--accent)" }}
            onClick={handleForgotPassword}
          >
            Mot de passe oublie ?
          </button>

          {/* Styled checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer mt-1">
            <div
              className="relative w-5 h-5 rounded-md flex items-center justify-center transition-colors"
              style={{
                background: stayLogged ? "var(--accent)" : "var(--surface2)",
                border: stayLogged ? "none" : "1.5px solid var(--glass-border)",
              }}
              onClick={(e) => { e.preventDefault(); setStayLogged(!stayLogged); }}
            >
              {stayLogged && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </div>
            <span className="text-xs" style={{ color: "var(--dim)" }}>Rester connecte</span>
          </label>

          <button type="submit" className="btn btn-primary mt-3" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>

      {/* Bottom links */}
      <p className="text-center text-[13px] mt-6" style={{ color: "var(--dim)" }}>
        Pas encore inscrit ?{" "}
        <Link href="/signup" className="font-bold" style={{ color: "var(--accent)" }}>
          Creer un compte
        </Link>
      </p>
      <Link
        href="/demo"
        className="text-center text-[13px] mt-3 transition-colors"
        style={{ color: "var(--dim)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
      >
        Essayer la demo →
      </Link>
    </div>
  );
}
