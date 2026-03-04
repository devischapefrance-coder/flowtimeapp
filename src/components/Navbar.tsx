"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import SearchOverlay from "./SearchOverlay";
import { useProfile } from "@/app/(app)/layout";

const tabs = [
  { href: "/home", emoji: "🏠", label: "Accueil" },
  { href: "/famille", emoji: "👨‍👩‍👧‍👦", label: "Famille" },
  { href: "/vie", emoji: "📌", label: "Vie" },
  { href: "/reglages", emoji: "⚙️", label: "Reglages" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);
  const { profile } = useProfile();

  return (
    <>
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full flex justify-around items-center"
        style={{
          maxWidth: 430,
          background: "var(--nav-bg)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid var(--glass-border)",
          paddingTop: 8,
          paddingBottom: "calc(8px + env(safe-area-inset-bottom))",
          zIndex: 100,
        }}
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
            >
              {active && (
                <span
                  className="absolute -top-[8px] left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              )}
              <span
                className="text-[20px] transition-transform"
                style={{ transform: active ? "scale(1.15)" : "scale(1)" }}
              >
                {tab.emoji}
              </span>
              <span
                className="text-[9px] font-bold transition-colors"
                style={{ color: active ? "var(--accent)" : "var(--dim)" }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
        {/* Search button */}
        <button
          className="flex flex-col items-center gap-0.5 py-1 px-3"
          onClick={() => setSearchOpen(true)}
        >
          <span className="text-[20px]">🔍</span>
          <span className="text-[9px] font-bold" style={{ color: "var(--dim)" }}>Chercher</span>
        </button>
      </nav>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        familyId={profile?.family_id}
      />
    </>
  );
}
