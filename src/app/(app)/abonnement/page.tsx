"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProfile } from "../layout";
import { supabase } from "@/lib/supabase";

const PLANS = [
  {
    key: "free" as const,
    name: "Free",
    emoji: "🌱",
    monthlyPrice: 0,
    annualPrice: 0,
    features: [
      { label: "4 membres max", included: true },
      { label: "3 messages Flow / jour", included: true },
      { label: "1 routine", included: true },
      { label: "Documents", included: true },
      { label: "Export ICS / PDF", included: true },
      { label: "Partage externe", included: true },
      { label: "Thème sombre uniquement", included: true },
      { label: "Message proactif IA", included: false },
      { label: "Snap Map", included: false },
      { label: "Résumé hebdo IA", included: false },
    ],
  },
  {
    key: "plus" as const,
    name: "FlowTime+",
    emoji: "⚡",
    monthlyPrice: 4.99,
    annualPrice: 49.99,
    popular: true,
    priceKeys: { monthly: "plus_monthly", annual: "plus_annual" },
    features: [
      { label: "Membres illimités", included: true },
      { label: "Flow IA illimité", included: true },
      { label: "5 routines", included: true },
      { label: "Message proactif IA", included: true },
      { label: "Documents", included: true },
      { label: "Snap Map", included: true },
      { label: "10 thèmes", included: true },
      { label: "Export ICS / PDF", included: true },
      { label: "Partage externe", included: false },
      { label: "Résumé hebdo IA", included: false },
    ],
  },
  {
    key: "pro" as const,
    name: "FlowTime Pro",
    emoji: "👑",
    monthlyPrice: 7.99,
    annualPrice: 69.99,
    priceKeys: { monthly: "pro_monthly", annual: "pro_annual" },
    features: [
      { label: "Membres illimités", included: true },
      { label: "Flow IA illimité", included: true },
      { label: "Routines illimitées", included: true },
      { label: "Message proactif IA", included: true },
      { label: "Documents", included: true },
      { label: "Snap Map", included: true },
      { label: "30 thèmes dont 10 exclusifs", included: true },
      { label: "Export ICS / PDF", included: true },
      { label: "Partage externe", included: true },
      { label: "Résumé hebdo IA", included: true },
    ],
  },
];

export default function AbonnementPage() {
  const { profile } = useProfile();
  const searchParams = useSearchParams();
  const [annual, setAnnual] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);

  const currentPlan = profile?.subscription_plan || "free";
  const isActive = profile?.subscription_status === "active";
  const success = searchParams.get("success") === "true";
  const canceled = searchParams.get("canceled") === "true";

  async function getAuthToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  }

  async function handleCheckout(priceKey: string) {
    setLoading(priceKey);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceKey }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setLoading(null);
    }
  }

  async function handlePortal() {
    setLoading("portal");
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error("Portal error:", err);
    } finally {
      setLoading(null);
    }
  }

  const periodEnd = profile?.subscription_period_end
    ? new Date(profile.subscription_period_end).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="px-4 pt-4 pb-8 max-w-[430px] mx-auto">
      <h1 className="text-xl font-bold mb-1">Abonnement</h1>
      <p className="text-xs mb-5" style={{ color: "var(--dim)" }}>
        Débloquez toutes les fonctionnalités de FlowTime
      </p>

      {/* Status banners */}
      {success && (
        <div className="glass p-3 mb-4 rounded-xl text-center text-sm" style={{ borderColor: "#22c55e40" }}>
          ✅ Abonnement activé ! Bienvenue dans FlowTime{currentPlan === "pro" ? " Pro" : "+"} 🎉
        </div>
      )}
      {canceled && (
        <div className="glass p-3 mb-4 rounded-xl text-center text-sm" style={{ borderColor: "#f59e0b40" }}>
          Le paiement a été annulé. Vous pouvez réessayer quand vous voulez.
        </div>
      )}

      {/* Current plan badge */}
      {isActive && currentPlan !== "free" && (
        <div className="glass p-3 mb-4 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold">
              {currentPlan === "pro" ? "👑 FlowTime Pro" : "⚡ FlowTime+"}
            </span>
            {periodEnd && (
              <p className="text-xs mt-0.5" style={{ color: "var(--dim)" }}>
                Renouvellement le {periodEnd}
              </p>
            )}
          </div>
          <button
            onClick={handlePortal}
            disabled={loading === "portal"}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
          >
            {loading === "portal" ? "..." : "Gérer"}
          </button>
        </div>
      )}

      {profile?.subscription_status === "past_due" && (
        <div className="glass p-3 mb-4 rounded-xl text-center text-sm" style={{ borderColor: "#ef444440" }}>
          ⚠️ Paiement en retard — mettez à jour votre moyen de paiement
          <button
            onClick={handlePortal}
            className="block mx-auto mt-2 text-xs px-3 py-1 rounded-lg font-medium"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            Mettre à jour
          </button>
        </div>
      )}

      {/* Annual / Monthly toggle */}
      <div className="flex items-center justify-center gap-3 mb-5">
        <button
          onClick={() => setAnnual(false)}
          className="text-xs font-medium px-3 py-1.5 rounded-full transition-all"
          style={{
            background: !annual ? "var(--accent)" : "var(--glass-bg)",
            color: !annual ? "#fff" : "var(--dim)",
            border: `1px solid ${!annual ? "var(--accent)" : "var(--glass-border)"}`,
          }}
        >
          Mensuel
        </button>
        <button
          onClick={() => setAnnual(true)}
          className="text-xs font-medium px-3 py-1.5 rounded-full transition-all"
          style={{
            background: annual ? "var(--accent)" : "var(--glass-bg)",
            color: annual ? "#fff" : "var(--dim)",
            border: `1px solid ${annual ? "var(--accent)" : "var(--glass-border)"}`,
          }}
        >
          Annuel
          <span className="ml-1.5 text-[10px] opacity-80">-17%</span>
        </button>
      </div>

      {/* Plan cards */}
      <div className="flex flex-col gap-4">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key && isActive;
          const price = annual ? plan.annualPrice : plan.monthlyPrice;
          const period = annual ? "/an" : "/mois";

          return (
            <div
              key={plan.key}
              className="glass rounded-2xl p-4 relative"
              style={{
                border: plan.popular
                  ? "1.5px solid var(--accent)"
                  : "1px solid var(--glass-border)",
              }}
            >
              {plan.popular && (
                <div
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-0.5 rounded-full"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  POPULAIRE
                </div>
              )}

              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{plan.emoji}</span>
                <span className="text-sm font-bold">{plan.name}</span>
              </div>

              {price > 0 ? (
                <div className="mb-3">
                  <span className="text-2xl font-bold">{price.toFixed(2).replace(".", ",")}€</span>
                  <span className="text-xs ml-1" style={{ color: "var(--dim)" }}>{period}</span>
                  {annual && plan.monthlyPrice > 0 && (
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--dim)" }}>
                      soit {(plan.annualPrice / 12).toFixed(2).replace(".", ",")}€/mois
                    </p>
                  )}
                </div>
              ) : (
                <div className="mb-3">
                  <span className="text-2xl font-bold">Gratuit</span>
                </div>
              )}

              {/* Features */}
              <div className="flex flex-col gap-1.5 mb-4">
                {plan.features.map((f) => (
                  <div key={f.label} className="flex items-center gap-2 text-xs">
                    <span style={{ color: f.included ? "#22c55e" : "var(--dim)", fontSize: "10px" }}>
                      {f.included ? "✓" : "✕"}
                    </span>
                    <span style={{ color: f.included ? "var(--text)" : "var(--dim)" }}>
                      {f.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA button */}
              {plan.key === "free" ? (
                <div
                  className="text-center text-xs py-2 rounded-xl font-medium"
                  style={{ color: "var(--dim)" }}
                >
                  {isCurrent || currentPlan === "free" ? "Plan actuel" : ""}
                </div>
              ) : isCurrent ? (
                <div
                  className="text-center text-xs py-2.5 rounded-xl font-medium"
                  style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", color: "var(--dim)" }}
                >
                  Plan actuel ✓
                </div>
              ) : (
                <button
                  onClick={() => {
                    const key = annual ? plan.priceKeys!.annual : plan.priceKeys!.monthly;
                    handleCheckout(key);
                  }}
                  disabled={!!loading}
                  className="w-full text-sm py-2.5 rounded-xl font-semibold transition-all active:scale-[0.98]"
                  style={{
                    background: plan.popular
                      ? "linear-gradient(135deg, var(--accent), #9B8BFF)"
                      : "var(--glass-bg)",
                    color: plan.popular ? "#fff" : "var(--text)",
                    border: plan.popular ? "none" : "1px solid var(--glass-border)",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? "..." : "Choisir"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-center text-[10px] mt-6" style={{ color: "var(--dim)" }}>
        Paiement sécurisé par Stripe. Annulable à tout moment.
      </p>
    </div>
  );
}
