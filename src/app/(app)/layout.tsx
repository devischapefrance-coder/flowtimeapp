"use client";

import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import Navbar from "@/components/Navbar";
import Logo from "@/components/Logo";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/Toast";
import FamilyChat from "@/components/FamilyChat";

interface ProfileContextType {
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  refreshProfile: async () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const handleUnread = useCallback((n: number) => setChatUnread(n), []);

  const initialLang = typeof window !== "undefined"
    ? localStorage.getItem("flowtime_lang") || "fr"
    : "fr";

  async function loadProfile() {
    // Use getSession (reads local token) instead of getUser (network call)
    // to avoid losing session when iOS purges cookies on app kill
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      router.push("/");
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (data) setProfile(data as Profile);
    setReady(true);

    // Check onboarding
    if (!localStorage.getItem("flowtime_onboarded") && data) {
      const created = new Date(data.created_at);
      const now = new Date();
      if (now.getTime() - created.getTime() < 5 * 60 * 1000) {
        router.push("/onboarding");
      } else {
        localStorage.setItem("flowtime_onboarded", "true");
      }
    }
  }

  useEffect(() => {
    // "Rester connecté" logic: if user chose session-only and this is a new browser session, sign out
    const sessionOnly = localStorage.getItem("flowtime_session_only");
    if (sessionOnly) {
      const stillActive = sessionStorage.getItem("flowtime_session_active");
      if (!stillActive) {
        localStorage.removeItem("flowtime_session_only");
        supabase.auth.signOut().then(() => router.push("/"));
        return;
      }
    }
    sessionStorage.setItem("flowtime_session_active", "true");
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="animate-pulse"><Logo size={60} /></div>
      </div>
    );
  }

  return (
    <I18nProvider initialLang={initialLang}>
      <ProfileContext.Provider value={{ profile, refreshProfile: loadProfile }}>
        <ToastProvider>
          <div className="pb-[80px] page-transition" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
            {children}
          </div>

          {/* Floating chat button — visible on all pages */}
          {profile?.family_id && (
            <button
              className="fixed z-[90] w-12 h-12 rounded-full flex items-center justify-center text-lg shadow-lg active:scale-90 transition-transform"
              style={{ background: "var(--accent)", color: "#fff", bottom: 90, right: "max(16px, calc((100vw - 430px) / 2 + 16px))" }}
              onClick={() => setChatOpen(true)}
              aria-label="Chat famille"
            >
              💬
              {chatUnread > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "var(--red)" }}>
                  {chatUnread > 9 ? "9+" : chatUnread}
                </span>
              )}
            </button>
          )}

          {profile?.family_id && (
            <FamilyChat
              open={chatOpen}
              onClose={() => setChatOpen(false)}
              familyId={profile.family_id}
              userId={profile.id}
              userName={profile.first_name || "Moi"}
              userEmoji={profile.emoji || "👤"}
              onUnread={handleUnread}
            />
          )}

          <Navbar />
        </ToastProvider>
      </ProfileContext.Provider>
    </I18nProvider>
  );
}
