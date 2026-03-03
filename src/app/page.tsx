"use client";

import Link from "next/link";

export default function Splash() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 animate-in">
      <div
        className="flex items-center justify-center"
        style={{
          width: 90,
          height: 90,
          borderRadius: 28,
          background: "linear-gradient(135deg, var(--accent), #FFA559)",
          boxShadow: "0 4px 30px var(--accent-glow)",
          fontSize: 40,
        }}
      >
        🌊
      </div>

      <h1
        className="mt-5 text-[32px] font-bold"
        style={{ fontFamily: "var(--font-fraunces), serif" }}
      >
        FlowTime
      </h1>

      <p className="mt-2 text-[13px]" style={{ color: "var(--dim)" }}>
        Votre famille, parfaitement synchronisée
      </p>

      <div className="flex flex-col gap-3 w-full max-w-[300px] mt-[50px]">
        <Link href="/signup" className="btn btn-primary">
          Créer un compte
        </Link>
        <Link href="/login" className="btn btn-secondary">
          J&apos;ai déjà un compte
        </Link>
      </div>

      <p
        className="mt-auto pb-6 text-[9px]"
        style={{ color: "var(--faint)" }}
      >
        v2.0 · Données sécurisées via Supabase
      </p>
    </div>
  );
}
