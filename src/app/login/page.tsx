"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinCode = searchParams.get("join");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [stayLogged, setStayLogged] = useState(true);

  async function handleJoinAfterLogin(accessToken: string) {
    if (!joinCode) return;
    try {
      await fetch("/api/family/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code: joinCode }),
      });
    } catch {
      // Silently fail — user can join later from settings
    }
  }

  // Detect OAuth redirect (Google) and redirect to /home
  useEffect(() => {
    async function checkProfileExists(userId: string): Promise<boolean> {
      const { data } = await supabase.from("profiles").select("id").eq("id", userId).single();
      return !!data;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Block Google OAuth if no account exists (must sign up first)
        const hasProfile = await checkProfileExists(session.user.id);
        if (!hasProfile) {
          await supabase.auth.signOut();
          setError("Aucun compte trouvé. Inscrivez-vous d'abord !");
          return;
        }
        await handleJoinAfterLogin(session.access_token);
        router.push("/home");
      }
    });
    // Also check if already signed in
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const hasProfile = await checkProfileExists(session.user.id);
        if (!hasProfile) {
          await supabase.auth.signOut();
          return;
        }
        await handleJoinAfterLogin(session.access_token);
        router.push("/home");
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Entre ton email d'abord");
      return;
    }
    setError("");
    setLoading(true);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });
    setLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccess("Un email de r\u00e9initialisation a \u00e9t\u00e9 envoy\u00e9 !");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
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

    if (data.session) {
      await handleJoinAfterLogin(data.session.access_token);
    }
    router.push("/home");
  }

  async function handleGoogleLogin() {
    setError("");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUrl = joinCode ? `${siteUrl}/join?code=${joinCode}` : `${siteUrl}/home`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl },
    });
    if (oauthError) {
      setError(oauthError.message);
    }
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
        Connectez-vous &agrave; votre espace famille
      </p>

      {joinCode && (
        <div
          className="mt-3 px-4 py-2 rounded-xl text-xs font-bold text-center"
          style={{
            background: "rgba(124,107,240,0.1)",
            color: "var(--accent)",
            border: "1px solid rgba(124,107,240,0.2)",
          }}
        >
          Connecte-toi pour rejoindre la famille {joinCode}
        </div>
      )}

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
            Mot de passe oubli&eacute; ?
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
            <span className="text-xs" style={{ color: "var(--dim)" }}>Rester connect&eacute;</span>
          </label>

          <button type="submit" className="btn btn-primary mt-3" disabled={loading}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>

        {/* Separator */}
        <div className="flex items-center gap-3 my-5">
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
          onClick={handleGoogleLogin}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continuer avec Google
        </button>
      </div>

      {/* Bottom links */}
      <p className="text-center text-[13px] mt-6" style={{ color: "var(--dim)" }}>
        Pas encore inscrit ?{" "}
        <Link href="/signup" className="font-bold" style={{ color: "var(--accent)" }}>
          Cr&eacute;er un compte
        </Link>
      </p>
      <Link
        href="/demo"
        className="text-center text-[13px] mt-3 transition-colors"
        style={{ color: "var(--dim)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--dim)")}
      >
        Essayer la d&eacute;mo &rarr;
      </Link>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
