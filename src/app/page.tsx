"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

export default function LandingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push("/home");
      } else {
        setReady(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) return null;

  const features = [
    { icon: "\u{1F4C5}", title: "Planning familial", desc: "Calendrier partag\u00e9, \u00e9v\u00e9nements, rappels et r\u00e9currences pour toute la famille." },
    { icon: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}", title: "Gestion famille", desc: "Membres, contacts, adresses et carte interactive avec localisation en temps r\u00e9el." },
    { icon: "\u{1F30A}", title: "Assistant Flow", desc: "Une IA qui organise votre quotidien : cr\u00e9ez, modifiez, supprimez par simple conversation." },
    { icon: "\u{1F4CC}", title: "Vie de famille", desc: "Notes, courses, d\u00e9penses, t\u00e2ches m\u00e9nag\u00e8res \u2014 tout au m\u00eame endroit." },
  ];

  const strengths = [
    { icon: "\u2728", title: "Gratuit", desc: "Toutes les fonctionnalit\u00e9s essentielles, sans frais." },
    { icon: "\u{1F512}", title: "S\u00e9curis\u00e9", desc: "Donn\u00e9es isol\u00e9es par famille, chiffrement et RLS." },
    { icon: "\u{1F4F1}", title: "Mobile-first", desc: "PWA installable, con\u00e7ue pour le mobile." },
  ];

  return (
    <div
      className="flex flex-col items-center min-h-dvh px-6 animate-in gradient-bg overflow-x-hidden"
      style={{
        paddingTop: "max(60px, env(safe-area-inset-top, 60px))",
        paddingBottom: "max(40px, env(safe-area-inset-bottom, 40px))",
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

      {/* Hero */}
      <div className="flex flex-col items-center text-center stagger-in">
        <div
          className="flex items-center justify-center relative"
          style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
            boxShadow: "0 8px 40px var(--accent-glow)",
          }}
        >
          <Logo size={50} />
        </div>

        <h1
          className="mt-5 text-[32px] font-bold"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          FlowTime
        </h1>
        <p className="mt-2 text-[15px] max-w-[300px] leading-relaxed" style={{ color: "var(--dim)" }}>
          Votre famille, parfaitement synchronis&eacute;e.
        </p>

        <div className="flex gap-3 mt-6 w-full max-w-[320px]">
          <Link href="/signup" className="btn btn-primary flex-1 text-center">
            Commencer gratuitement
          </Link>
          <Link
            href="/login"
            className="btn btn-secondary flex-1 text-center"
          >
            Se connecter
          </Link>
        </div>
      </div>

      {/* Features */}
      <div className="w-full max-w-[380px] mt-12">
        <h2
          className="text-lg font-bold text-center mb-5"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Tout pour votre famille
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {features.map((f, i) => (
            <div
              key={i}
              className="glass p-4 stagger-in"
              style={{ borderRadius: "var(--radius)", animationDelay: `${i * 80}ms` }}
            >
              <div className="text-2xl mb-2">{f.icon}</div>
              <p className="text-sm font-bold mb-1">{f.title}</p>
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--dim)" }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths */}
      <div className="w-full max-w-[380px] mt-10">
        <div className="flex gap-3">
          {strengths.map((s, i) => (
            <div
              key={i}
              className="flex-1 text-center stagger-in"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="text-2xl mb-1.5">{s.icon}</div>
              <p className="text-xs font-bold">{s.title}</p>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--dim)" }}>
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <div className="w-full max-w-[380px] mt-12 mb-6 text-center stagger-in" style={{ animationDelay: "300ms" }}>
        <div className="glass p-6" style={{ borderRadius: "var(--radius)" }}>
          <p className="text-sm font-bold mb-1">
            Rejoignez des familles qui s&apos;organisent mieux
          </p>
          <p className="text-[11px] mb-4" style={{ color: "var(--dim)" }}>
            Inscription gratuite, aucune carte requise.
          </p>
          <Link href="/signup" className="btn btn-primary w-full text-center">
            Cr&eacute;er mon espace famille
          </Link>
        </div>
      </div>

      {/* Footer */}
      <p className="text-[10px] mb-2" style={{ color: "var(--faint)" }}>
        Fait avec &hearts; par FlowTime Team
      </p>
    </div>
  );
}
