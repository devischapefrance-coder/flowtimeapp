"use client";

import { useEffect, useState } from "react";
import { useProfile } from "../layout";
import FloChat from "@/components/flo/FloChat";

export default function FloPage() {
  const { profile } = useProfile();
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    if (profile?.is_dev) {
      setIsDev(true);
    }
  }, [profile]);

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)]" style={{ maxWidth: "430px", margin: "0 auto" }}>
      {/* Bandeau mode dev */}
      {isDev && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs shrink-0"
          style={{
            background: "rgba(245, 197, 99, 0.08)",
            color: "var(--warm)",
            borderBottom: "1px solid rgba(245, 197, 99, 0.12)",
          }}
        >
          ⚠️
          Mode développeur actif — tes conversations ne sont pas sauvegardées
        </div>
      )}

      <FloChat isDev={isDev} userId={profile?.id} />
    </div>
  );
}
