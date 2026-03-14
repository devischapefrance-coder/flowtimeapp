"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase automatically picks up the recovery token from the URL hash
    // and establishes a session. We listen for the PASSWORD_RECOVERY event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also check if we already have a session (user clicked link and session was auto-established)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setError("Le mot de passe doit contenir au moins 8 caractères, 1 majuscule, 1 chiffre et 1 caractère spécial");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setTimeout(() => router.push("/home"), 2000);
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 gradient-bg">
      <div className="w-full" style={{ maxWidth: 380 }}>
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Logo size={48} />
          </div>
          <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
          <p className="text-sm mt-1" style={{ color: "var(--dim)" }}>
            Choisis un nouveau mot de passe pour ton compte
          </p>
        </div>

        {success ? (
          <div className="card text-center">
            <p className="text-3xl mb-3">✅</p>
            <p className="text-sm font-bold">Mot de passe modifié !</p>
            <p className="text-xs mt-1" style={{ color: "var(--dim)" }}>
              Redirection vers l&apos;accueil...
            </p>
          </div>
        ) : !ready ? (
          <div className="card text-center">
            <div className="animate-pulse mb-3">
              <Logo size={32} />
            </div>
            <p className="text-sm" style={{ color: "var(--dim)" }}>
              Vérification du lien...
            </p>
            <p className="text-xs mt-3" style={{ color: "var(--faint)" }}>
              Si rien ne se passe, le lien a peut-être expiré.{" "}
              <button
                className="font-bold"
                style={{ color: "var(--accent)" }}
                onClick={() => router.push("/")}
              >
                Retour au login
              </button>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
            {error && (
              <p className="text-xs font-bold" style={{ color: "var(--red)" }}>{error}</p>
            )}

            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>
                Nouveau mot de passe
              </label>
              <input
                type="password"
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 caractères"
                minLength={8}
                required
              />
              {newPassword.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full"
                      style={{
                        background:
                          newPassword.length >= i * 3
                            ? i <= 1
                              ? "var(--red)"
                              : i <= 2
                              ? "var(--warm)"
                              : i <= 3
                              ? "var(--teal)"
                              : "var(--green)"
                            : "var(--surface2)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--dim)" }}>
                Confirmer
              </label>
              <input
                type="password"
                className="w-full px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Retape le mot de passe"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !newPassword || !confirmPassword}
            >
              {loading ? "Modification..." : "Modifier le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
