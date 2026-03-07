"use client";

import { useRouter } from "next/navigation";

interface UpgradeNudgeProps {
  feature: string;
  plan?: "plus" | "pro";
  className?: string;
  compact?: boolean;
}

export default function UpgradeNudge({ feature, plan = "plus", className = "" }: UpgradeNudgeProps) {
  const router = useRouter();
  const label = plan === "pro" ? "FlowTime Pro" : "FlowTime+";

  return (
    <div
      className={`glass rounded-xl p-3 flex items-center gap-3 ${className}`}
      style={{ border: "1px solid rgba(124,107,240,0.3)" }}
    >
      <span className="text-lg">🔒</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold">{feature}</p>
        <p className="text-[10px]" style={{ color: "var(--dim)" }}>
          Disponible avec {label}
        </p>
      </div>
      <button
        onClick={() => router.push("/abonnement")}
        className="text-[10px] font-bold px-3 py-1.5 rounded-lg shrink-0"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        Voir
      </button>
    </div>
  );
}
