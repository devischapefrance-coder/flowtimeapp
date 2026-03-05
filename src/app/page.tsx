"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Logo from "@/components/Logo";

/* ── Animated counter ── */
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const duration = 1200;
          const step = Math.ceil(target / (duration / 16));
          let current = 0;
          const timer = setInterval(() => {
            current += step;
            if (current >= target) {
              current = target;
              clearInterval(timer);
            }
            setCount(current);
          }, 16);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  return (
    <span ref={ref}>
      {count}{suffix}
    </span>
  );
}

/* ── Scroll-reveal section ── */
function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

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
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          <circle cx="12" cy="16" r="1.5" fill="var(--accent)" stroke="none" />
        </svg>
      ),
      title: "Planning familial",
      desc: "Calendrier partagé, événements récurrents, rappels intelligents et export PDF.",
      color: "var(--accent)",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      title: "Gestion famille",
      desc: "Membres, contacts de confiance, adresses et carte interactive en temps réel.",
      color: "var(--teal)",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--lavender)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <circle cx="9" cy="10" r="0.8" fill="var(--lavender)" stroke="none" /><circle cx="12" cy="10" r="0.8" fill="var(--lavender)" stroke="none" /><circle cx="15" cy="10" r="0.8" fill="var(--lavender)" stroke="none" />
        </svg>
      ),
      title: "Assistant Flow",
      desc: "Une IA conversationnelle qui gère votre planning à la voix ou au texte.",
      color: "var(--lavender)",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--warm)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      ),
      title: "Vie de famille",
      desc: "Notes collaboratives, courses, dépenses partagées et tâches ménagères.",
      color: "var(--warm)",
    },
  ];

  const highlights = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
        </svg>
      ),
      title: "Localisation en direct",
      desc: "Voyez où se trouvent vos proches sur la carte en temps réel.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ),
      title: "Notifications push",
      desc: "Rappels le matin, alertes 15 min avant chaque événement.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--warm)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      title: "Récurrences",
      desc: "Événements quotidiens, hebdo ou mensuels sans ressaisir.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      title: "Bien-être",
      desc: "Méditation, respiration, yoga et suivi d'activités intégrés.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--lavender)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
      title: "Sécurité totale",
      desc: "Données isolées par famille, chiffrement et contrôle d'accès RLS.",
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
        </svg>
      ),
      title: "Itinéraires gratuits",
      desc: "Calcul d'itinéraires voiture, vélo et piéton sans clé API.",
    },
  ];

  return (
    <div
      className="flex flex-col items-center min-h-dvh overflow-x-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* ═══ HERO ═══ */}
      <section
        className="relative w-full flex flex-col items-center text-center px-6"
        style={{
          paddingTop: "max(80px, env(safe-area-inset-top, 80px))",
          paddingBottom: 60,
          background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,107,240,0.15) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(94,212,200,0.08) 0%, transparent 70%)",
        }}
      >
        {/* Floating orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute rounded-full"
            style={{
              width: 300, height: 300, top: -80, left: "50%", marginLeft: -150,
              background: "radial-gradient(circle, rgba(124,107,240,0.18) 0%, transparent 70%)",
              filter: "blur(60px)",
              animation: "float 8s ease-in-out infinite",
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: 200, height: 200, bottom: -40, right: -60,
              background: "radial-gradient(circle, rgba(94,212,200,0.12) 0%, transparent 70%)",
              filter: "blur(50px)",
              animation: "float 10s ease-in-out infinite reverse",
            }}
          />
        </div>

        {/* Logo with glow ring */}
        <div className="relative stagger-in">
          <div
            className="absolute inset-0 rounded-[28px]"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--teal))",
              filter: "blur(20px)",
              opacity: 0.3,
              transform: "scale(1.3)",
            }}
          />
          <div
            className="relative flex items-center justify-center"
            style={{
              width: 88,
              height: 88,
              borderRadius: 28,
              background: "linear-gradient(135deg, var(--accent), #9B8BFF)",
              boxShadow: "0 12px 48px var(--accent-glow)",
            }}
          >
            <Logo size={54} />
          </div>
        </div>

        <h1
          className="mt-6 text-[36px] font-bold leading-tight stagger-in"
          style={{ fontFamily: "var(--font-fraunces), serif" }}
        >
          Flow<span style={{ color: "var(--accent)" }}>Time</span>
        </h1>
        <p
          className="mt-3 text-[16px] max-w-[300px] leading-relaxed stagger-in"
          style={{ color: "var(--dim)" }}
        >
          Votre famille, parfaitement synchronisée.
        </p>

        {/* Hero CTA */}
        <div className="flex flex-col gap-3 mt-8 w-full max-w-[320px] stagger-in">
          <Link href="/signup" className="btn btn-primary text-center">
            Commencer gratuitement
          </Link>
          <Link href="/login" className="btn btn-secondary text-center">
            Se connecter
          </Link>
        </div>

        {/* Social proof */}
        <div className="flex items-center gap-2 mt-8 stagger-in">
          <div className="flex -space-x-2">
            {["👨", "👩", "👧", "👦", "👶"].map((e, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{
                  background: "var(--surface2)",
                  border: "2px solid var(--bg)",
                  zIndex: 5 - i,
                }}
              >
                {e}
              </div>
            ))}
          </div>
          <p className="text-[11px]" style={{ color: "var(--dim)" }}>
            Des familles s&apos;organisent déjà mieux
          </p>
        </div>
      </section>

      {/* ═══ PHONE MOCKUP ═══ */}
      <Reveal className="w-full flex justify-center px-6 -mt-2 mb-8">
        <div
          className="relative w-full max-w-[280px]"
          style={{
            borderRadius: 32,
            border: "3px solid var(--glass-border)",
            background: "var(--surface-solid)",
            overflow: "hidden",
            boxShadow: "0 24px 80px rgba(0,0,0,0.4), 0 0 0 1px var(--glass-border)",
          }}
        >
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <span className="text-[10px] font-bold" style={{ color: "var(--dim)" }}>9:41</span>
            <div className="flex gap-1">
              <div className="w-3.5 h-2 rounded-sm" style={{ background: "var(--dim)" }} />
              <div className="w-1.5 h-2 rounded-sm" style={{ background: "var(--dim)" }} />
              <div className="w-4 h-2 rounded-full" style={{ background: "var(--green)" }} />
            </div>
          </div>
          {/* App header */}
          <div className="px-4 pb-3 flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, var(--accent), #9B8BFF)" }}
            >
              <Logo size={22} />
            </div>
            <div>
              <p className="text-xs font-bold">Bonjour, Marie</p>
              <p className="text-[9px]" style={{ color: "var(--dim)" }}>3 événements aujourd&apos;hui</p>
            </div>
          </div>
          {/* Mock cards */}
          <div className="px-3 pb-4 flex flex-col gap-2">
            <div className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--glass-border)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                <span className="text-[10px] font-bold">09:00 — École</span>
              </div>
              <p className="text-[9px] pl-4" style={{ color: "var(--dim)" }}>Déposer Léa et Tom</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--glass-border)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: "var(--teal)" }} />
                <span className="text-[10px] font-bold">12:30 — Déjeuner</span>
              </div>
              <p className="text-[9px] pl-4" style={{ color: "var(--dim)" }}>Restaurant avec Mamie</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: "var(--surface2)", border: "1px solid var(--glass-border)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: "var(--warm)" }} />
                <span className="text-[10px] font-bold">16:00 — Piano</span>
              </div>
              <p className="text-[9px] pl-4" style={{ color: "var(--dim)" }}>Cours de Léa</p>
            </div>
            {/* Mock Flow AI */}
            <div className="rounded-xl p-3 mt-1" style={{ background: "rgba(124,107,240,0.08)", border: "1px solid rgba(124,107,240,0.15)" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs">🌊</span>
                <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>Flow</span>
              </div>
              <p className="text-[9px]" style={{ color: "var(--dim)" }}>
                &ldquo;Rappel : anniversaire de Tom dans 3 jours !&rdquo;
              </p>
            </div>
          </div>
          {/* Mock navbar */}
          <div
            className="flex justify-around py-2.5"
            style={{ background: "var(--nav-bg)", borderTop: "1px solid var(--glass-border)" }}
          >
            {["🏠", "👨‍👩‍👧‍👦", "🌊", "⚙️"].map((icon, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                style={{ opacity: i === 0 ? 1 : 0.4 }}
              >
                {icon}
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* ═══ FEATURES ═══ */}
      <section className="w-full max-w-[400px] px-6">
        <Reveal className="text-center mb-6">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--accent)" }}>
            Fonctionnalités
          </p>
          <h2
            className="text-[22px] font-bold leading-tight"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Tout ce dont votre famille a besoin
          </h2>
        </Reveal>

        <div className="flex flex-col gap-3">
          {features.map((f, i) => (
            <Reveal key={i} delay={i * 80}>
              <div
                className="glass p-5 flex gap-4 items-start"
                style={{ borderRadius: "var(--radius)" }}
              >
                <div
                  className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: `color-mix(in srgb, ${f.color} 12%, transparent)` }}
                >
                  {f.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold mb-0.5">{f.title}</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--dim)" }}>
                    {f.desc}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ STATS ═══ */}
      <Reveal className="w-full max-w-[400px] px-6 mt-12">
        <div
          className="glass p-6 flex justify-around text-center"
          style={{ borderRadius: "var(--radius)" }}
        >
          {[
            { value: 6, suffix: "+", label: "Activités bien-être" },
            { value: 12, suffix: "", label: "Catégories POI" },
            { value: 20, suffix: "", label: "Thèmes de couleurs" },
          ].map((s, i) => (
            <div key={i} className="flex-1">
              <p className="text-2xl font-extrabold" style={{ color: "var(--accent)" }}>
                <Counter target={s.value} suffix={s.suffix} />
              </p>
              <p className="text-[10px] mt-1" style={{ color: "var(--dim)" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ═══ HIGHLIGHTS GRID ═══ */}
      <section className="w-full max-w-[400px] px-6 mt-12">
        <Reveal className="text-center mb-6">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--teal)" }}>
            Et aussi
          </p>
          <h2
            className="text-[22px] font-bold leading-tight"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Bien plus qu&apos;un calendrier
          </h2>
        </Reveal>

        <div className="grid grid-cols-2 gap-3">
          {highlights.map((h, i) => (
            <Reveal key={i} delay={i * 60}>
              <div
                className="p-4"
                style={{
                  borderRadius: "var(--radius)",
                  background: "var(--surface)",
                  border: "1px solid var(--glass-border)",
                }}
              >
                <div className="mb-2">{h.icon}</div>
                <p className="text-xs font-bold mb-0.5">{h.title}</p>
                <p className="text-[10px] leading-relaxed" style={{ color: "var(--dim)" }}>
                  {h.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="w-full max-w-[400px] px-6 mt-12">
        <Reveal className="text-center mb-6">
          <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--warm)" }}>
            En 3 étapes
          </p>
          <h2
            className="text-[22px] font-bold leading-tight"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Simple comme bonjour
          </h2>
        </Reveal>

        <div className="flex flex-col gap-0 relative">
          {/* Vertical line */}
          <div
            className="absolute left-[23px] top-6 bottom-6 w-px"
            style={{ background: "linear-gradient(to bottom, var(--accent), var(--teal), var(--green))" }}
          />

          {[
            { num: "1", title: "Créez votre compte", desc: "Inscription gratuite en 30 secondes, avec email ou Google.", color: "var(--accent)" },
            { num: "2", title: "Invitez votre famille", desc: "Partagez un QR code ou un lien — ils rejoignent en un tap.", color: "var(--teal)" },
            { num: "3", title: "Organisez ensemble", desc: "Planning, courses, dépenses… tout est synchronisé en temps réel.", color: "var(--green)" },
          ].map((step, i) => (
            <Reveal key={i} delay={i * 120} className="flex items-start gap-4 py-4">
              <div
                className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-extrabold relative z-10"
                style={{
                  background: `color-mix(in srgb, ${step.color} 15%, var(--bg))`,
                  border: `2px solid ${step.color}`,
                  color: step.color,
                }}
              >
                {step.num}
              </div>
              <div className="pt-1">
                <p className="text-sm font-bold">{step.title}</p>
                <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: "var(--dim)" }}>
                  {step.desc}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══ TRUST BADGES ═══ */}
      <Reveal className="w-full max-w-[400px] px-6 mt-12">
        <div className="flex gap-3">
          {[
            { icon: "✨", title: "100% Gratuit", desc: "Pas de carte bancaire" },
            { icon: "🔒", title: "Vie privée", desc: "Données isolées" },
            { icon: "📱", title: "PWA", desc: "Installable sur mobile" },
          ].map((b, i) => (
            <div
              key={i}
              className="flex-1 text-center p-3.5"
              style={{
                borderRadius: "var(--radius)",
                background: "var(--surface)",
                border: "1px solid var(--glass-border)",
              }}
            >
              <div className="text-xl mb-1">{b.icon}</div>
              <p className="text-[11px] font-bold">{b.title}</p>
              <p className="text-[9px] mt-0.5" style={{ color: "var(--dim)" }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* ═══ FINAL CTA ═══ */}
      <Reveal className="w-full max-w-[400px] px-6 mt-14 mb-8">
        <div
          className="relative overflow-hidden p-7 text-center"
          style={{
            borderRadius: 20,
            background: "linear-gradient(135deg, rgba(124,107,240,0.12) 0%, rgba(94,212,200,0.08) 100%)",
            border: "1px solid rgba(124,107,240,0.15)",
          }}
        >
          {/* BG glow */}
          <div
            className="absolute rounded-full"
            style={{
              width: 200, height: 200, top: -60, right: -60,
              background: "radial-gradient(circle, rgba(124,107,240,0.15), transparent 70%)",
              filter: "blur(40px)",
              pointerEvents: "none",
            }}
          />
          <p
            className="text-[20px] font-bold mb-2 relative"
            style={{ fontFamily: "var(--font-fraunces), serif" }}
          >
            Prêt à simplifier votre quotidien ?
          </p>
          <p className="text-[12px] mb-5 relative" style={{ color: "var(--dim)" }}>
            Rejoignez des familles qui s&apos;organisent mieux avec FlowTime.
          </p>
          <Link href="/signup" className="btn btn-primary text-center relative">
            Créer mon espace famille
          </Link>
          <p className="text-[10px] mt-3 relative" style={{ color: "var(--faint)" }}>
            Gratuit, sans engagement, sans carte bancaire.
          </p>
        </div>
      </Reveal>

      {/* ═══ FOOTER ═══ */}
      <footer className="w-full max-w-[400px] px-6 pb-8 flex flex-col items-center gap-3">
        <div className="w-12 h-px" style={{ background: "var(--glass-border)" }} />
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, var(--accent), #9B8BFF)" }}
          >
            <Logo size={14} />
          </div>
          <span className="text-xs font-bold" style={{ color: "var(--dim)" }}>FlowTime</span>
        </div>
        <p className="text-[10px]" style={{ color: "var(--faint)" }}>
          Fait avec ♥ par FlowTime Team
        </p>
      </footer>

      {/* Keyframes for floating orbs */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
}
