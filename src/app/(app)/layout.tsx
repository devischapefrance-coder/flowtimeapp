"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import Navbar from "@/components/Navbar";
import Logo from "@/components/Logo";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/Toast";

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

          <Navbar />
        </ToastProvider>
      </ProfileContext.Provider>
    </I18nProvider>
  );
}
