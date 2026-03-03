"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/home", emoji: "🏠", label: "Accueil" },
  { href: "/famille", emoji: "👨‍👩‍👧‍👦", label: "Famille" },
  { href: "/bienetre", emoji: "🧘", label: "Bien-être" },
  { href: "/reglages", emoji: "⚙️", label: "Réglages" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full flex justify-around items-center py-2"
      style={{
        maxWidth: 430,
        background: "var(--surface)",
        borderTop: "1px solid rgba(255,255,255,0.04)",
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
            className="flex flex-col items-center gap-0.5 py-1 px-3"
            style={{ color: active ? "var(--accent)" : "var(--dim)" }}
          >
            <span className="text-[20px]">{tab.emoji}</span>
            <span className="text-[9px] font-bold">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
