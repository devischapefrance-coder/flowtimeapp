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
import TutorialOverlay from "@/components/TutorialOverlay";

interface ProfileContextType {
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  chatUnread: number;
  openChat: () => void;
  vieUnread: number;
  setVieUnread: (n: number) => void;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  refreshProfile: async () => {},
  chatUnread: 0,
  openChat: () => {},
  vieUnread: 0,
  setVieUnread: () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

interface TutorialContextType {
  tutorialActive: boolean;
  tutorialStep: number;
  startTutorial: () => void;
  stopTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
}

const TutorialContext = createContext<TutorialContextType>({
  tutorialActive: false,
  tutorialStep: 0,
  startTutorial: () => {},
  stopTutorial: () => {},
  nextStep: () => {},
  prevStep: () => {},
});

export function useTutorial() {
  return useContext(TutorialContext);
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const handleUnread = useCallback((n: number) => setChatUnread(n), []);
  const [vieUnread, setVieUnread] = useState(0);

  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const startTutorial = useCallback(() => { setTutorialStep(0); setTutorialActive(true); }, []);
  const stopTutorial = useCallback(() => { setTutorialActive(false); setTutorialStep(0); }, []);
  const nextStep = useCallback(() => setTutorialStep((s) => s + 1), []);
  const prevStep = useCallback(() => setTutorialStep((s) => Math.max(0, s - 1)), []);

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

    let { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    // Auto-create profile for OAuth users (Google, etc.)
    if (!data && user) {
      const meta = user.user_metadata || {};
      const newProfile = {
        id: user.id,
        email: user.email || "",
        first_name: meta.full_name?.split(" ")[0] || meta.name?.split(" ")[0] || "",
        last_name: meta.full_name?.split(" ").slice(1).join(" ") || meta.name?.split(" ").slice(1).join(" ") || "",
        emoji: "🌟",
      };
      await supabase.from("profiles").insert(newProfile);
      const { data: created } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      data = created;
    }

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

    // Listen for OAuth sign-in (Google redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        loadProfile();
      }
    });
    return () => subscription.unsubscribe();
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
      <ProfileContext.Provider value={{ profile, refreshProfile: loadProfile, chatUnread, openChat: () => setChatOpen(true), vieUnread, setVieUnread }}>
        <TutorialContext.Provider value={{ tutorialActive, tutorialStep, startTutorial, stopTutorial, nextStep, prevStep }}>
          <ToastProvider>
            <div className="pb-[80px] page-transition" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
              {children}
            </div>

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
            <TutorialOverlay
              active={tutorialActive}
              step={tutorialStep}
              onNext={nextStep}
              onPrev={prevStep}
              onStop={stopTutorial}
            />
          </ToastProvider>
        </TutorialContext.Provider>
      </ProfileContext.Provider>
    </I18nProvider>
  );
}
