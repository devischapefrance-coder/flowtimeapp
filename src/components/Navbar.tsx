"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "@/app/(app)/layout";

const baseTabs = [
  { href: "/home", emoji: "🏠", label: "Accueil" },
  { href: "/famille", emoji: "👨‍👩‍👧‍👦", label: "Famille" },
  { href: "/flowmap", emoji: "📍", label: "Carte" },
  { href: "/vie", emoji: "📌", label: "Vie" },
  { href: "/reglages", emoji: "⚙️", label: "Réglages" },
];

export default function Navbar() {
  const pathname = usePathname();
  const { profile, chatUnread, vieUnread } = useProfile();

  const tabs = profile?.is_dev
    ? [...baseTabs.slice(0, 4), { href: "/flo", emoji: "⚡", label: "Flo" }, baseTabs[4]]
    : baseTabs;

  return (
    <>
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full flex justify-around items-center"
        style={{
          maxWidth: 430,
          background: "var(--nav-bg)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid var(--glass-border)",
          paddingTop: 10,
          paddingBottom: 10,
          zIndex: 100,
        }}
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          const showBadge = (tab.href === "/home" && !active && chatUnread > 0) || (tab.href === "/vie" && !active && vieUnread > 0);
          const badgeCount = tab.href === "/home" ? chatUnread : vieUnread;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="flex flex-col items-center gap-0.5 py-1 px-3 relative"
            >
              {active && (
                <span
                  className="absolute -top-[8px] left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              )}
              <span
                className="text-[20px] transition-transform relative"
                style={{ transform: active ? "scale(1.15)" : "scale(1)" }}
              >
                {tab.emoji}
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: "var(--red)" }}>
                    {badgeCount > 9 ? "9+" : badgeCount}
                  </span>
                )}
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
      </nav>
    </>
  );
}
