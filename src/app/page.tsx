"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

export default function Splash() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 animate-in gradient-bg">
      {/* Decorative orb */}
      <div
        className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(124,107,240,0.12) 0%, transparent 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      <div
        className="flex items-center justify-center relative"
        style={{
          width: 90,
          height: 90,
          borderRadius: 28,
          background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
          boxShadow: "0 8px 40px var(--accent-glow)",
        }}
      >
        <Logo size={56} />
      </div>

      <h1
        className="mt-5 text-[32px] font-bold"
        style={{ fontFamily: "var(--font-fraunces), serif" }}
      >
        FlowTime
      </h1>

      <p className="mt-2 text-[13px] text-center" style={{ color: "var(--dim)" }}>
        Votre famille, parfaitement synchronisee
      </p>

      <div className="flex flex-col gap-3 w-full max-w-[300px] mt-[50px]">
        <Link href="/signup" className="btn btn-primary">
          Creer un compte
        </Link>
        <Link href="/login" className="btn btn-secondary">
          J&apos;ai deja un compte
        </Link>
      </div>

      <p
        className="mt-auto pb-6 text-[9px]"
        style={{ color: "var(--faint)" }}
      >
        v3.0 · Donnees securisees via Supabase
      </p>
    </div>
  );
}
