"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function JoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  const [status, setStatus] = useState("Chargement...");

  useEffect(() => {
    if (!code) {
      setStatus("Code famille manquant.");
      return;
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace(`/login?join=${encodeURIComponent(code)}`);
        return;
      }

      setStatus("Rejoint la famille en cours...");
      try {
        const res = await fetch("/api/family/join", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code }),
        });

        const result = await res.json();
        if (!res.ok) {
          setStatus(result.error || "Erreur lors de la jointure.");
          return;
        }

        setStatus("Bienvenue dans la famille !");
        setTimeout(() => router.replace("/famille"), 1500);
      } catch {
        setStatus("Erreur r\u00e9seau. R\u00e9essaie plus tard.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div
      className="flex flex-col items-center justify-center min-h-dvh px-6 gradient-bg"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="glass p-8 text-center" style={{ borderRadius: "var(--radius)", maxWidth: 340 }}>
        <div className="text-4xl mb-4">{"\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}"}</div>
        <p className="text-sm font-bold">{status}</p>
        {!code && (
          <button
            className="btn btn-primary mt-4"
            onClick={() => router.push("/")}
          >
            Retour &agrave; l&apos;accueil
          </button>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinContent />
    </Suspense>
  );
}
