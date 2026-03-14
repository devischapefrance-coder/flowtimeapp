"use client";

import { useEffect, useState, useCallback, createContext, useContext, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import Navbar from "@/components/Navbar";
import Logo from "@/components/Logo";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/components/Toast";
import FamilyChat from "@/components/FamilyChat";
import TutorialOverlay from "@/components/TutorialOverlay";
import { TUTORIAL_STEPS, TUTORIAL_SECTIONS, getFirstStepIndex } from "@/lib/tutorial-data";
import { subscribeToPush, isPushSubscribed } from "@/lib/push";
import { useTheme } from "@/lib/hooks/useTheme";
import type { AppTheme, ThemeMode } from "@/lib/types";

interface ProfileContextType {
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  chatUnread: number;
  openChat: () => void;
  vieUnread: number;
  setVieUnread: (n: number) => void;
  appTheme: AppTheme;
  appThemeMode: ThemeMode;
  setAppTheme: (theme: AppTheme, mode: ThemeMode) => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType>({
  profile: null,
  refreshProfile: async () => {},
  chatUnread: 0,
  openChat: () => {},
  vieUnread: 0,
  setVieUnread: () => {},
  appTheme: "default",
  appThemeMode: "dark",
  setAppTheme: async () => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

interface TutorialContextType {
  tutorialActive: boolean;
  tutorialStep: number;
  currentSection: string | null;
  completedSections: string[];
  startTutorial: () => void;
  startTutorialAtSection: (section: string) => void;
  stopTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipSection: () => void;
}

const TutorialContext = createContext<TutorialContextType>({
  tutorialActive: false,
  tutorialStep: 0,
  currentSection: null,
  completedSections: [],
  startTutorial: () => {},
  startTutorialAtSection: () => {},
  stopTutorial: () => {},
  nextStep: () => {},
  prevStep: () => {},
  skipSection: () => {},
});

export function useTutorial() {
  return useContext(TutorialContext);
}

const TAB_ORDER = ["/home", "/famille", "/flowmap", "/vie", "/reglages"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const handleUnread = useCallback((n: number) => setChatUnread(n), []);
  const [vieUnread, setVieUnread] = useState(0);

  const { theme: appTheme, themeMode: appThemeMode, setTheme: setAppTheme } = useTheme({ userId: profile?.id });

  // Page transition direction
  const prevPathRef = useRef(pathname);
  const [slideDir, setSlideDir] = useState<"none" | "left" | "right">("none");
  const [transitionKey, setTransitionKey] = useState(0);

  useEffect(() => {
    const prevIdx = TAB_ORDER.indexOf(prevPathRef.current);
    const newIdx = TAB_ORDER.indexOf(pathname);
    if (prevIdx !== -1 && newIdx !== -1 && prevIdx !== newIdx) {
      setSlideDir(newIdx > prevIdx ? "left" : "right");
      setTransitionKey((k) => k + 1);
    }
    prevPathRef.current = pathname;
  }, [pathname]);

  // Persistent location tracking (runs on all pages, not just /famille)
  const locationWatchRef = useRef<number | null>(null);
  const lastUploadRef = useRef<number>(0);

  useEffect(() => {
    if (!profile?.family_id || !profile?.id) return;

    // Check if user has location sharing enabled (has an entry in device_locations)
    let cancelled = false;
    supabase
      .from("device_locations")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        startLocationWatch();
      });

    function startLocationWatch() {
      if (locationWatchRef.current !== null) return;
      if (!("geolocation" in navigator)) return;

      const highAccuracy = profile!.gps_precision !== "low";

      // Immediate position update on start / app resume
      navigator.geolocation.getCurrentPosition(
        (pos) => uploadPosition(pos),
        (err) => console.warn("[GPS] getCurrentPosition error:", err.message),
        { enableHighAccuracy: highAccuracy, maximumAge: 30000, timeout: 10000 }
      );

      // Continuous tracking
      locationWatchRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const now = Date.now();
          if (now - lastUploadRef.current < 30000) return; // throttle 30s
          uploadPosition(pos);
        },
        (err) => console.warn("[GPS] watchPosition error:", err.message),
        { enableHighAccuracy: highAccuracy, maximumAge: highAccuracy ? 0 : 30000, timeout: 15000 }
      );
    }

    async function uploadPosition(pos: GeolocationPosition) {
      lastUploadRef.current = Date.now();
      const { error } = await supabase.from("device_locations").upsert({
        user_id: profile!.id,
        family_id: profile!.family_id,
        device_name: navigator.userAgent.includes("iPhone") ? "iPhone" : navigator.userAgent.includes("Android") ? "Android" : "Web",
        emoji: profile!.emoji || "📍",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) console.warn("[GPS] upload error:", error.message);
    }

    // Re-sync position when app comes back to foreground
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        navigator.geolocation.getCurrentPosition(
          (pos) => uploadPosition(pos),
          (err) => console.warn("[GPS] visibility re-sync error:", err.message),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
        );
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (locationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
    };
  }, [profile?.family_id, profile?.id]);

  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [completedSections, setCompletedSections] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("flowtime_tuto_sections") || "[]"); } catch { return []; }
    }
    return [];
  });

  const currentSection = tutorialActive ? (TUTORIAL_STEPS[tutorialStep]?.section ?? null) : null;

  const markSectionComplete = useCallback((sectionId: string) => {
    setCompletedSections((prev) => {
      if (prev.includes(sectionId)) return prev;
      const next = [...prev, sectionId];
      localStorage.setItem("flowtime_tuto_sections", JSON.stringify(next));
      return next;
    });
  }, []);

  const startTutorial = useCallback(() => { setTutorialStep(0); setTutorialActive(true); }, []);

  const startTutorialAtSection = useCallback((section: string) => {
    const idx = getFirstStepIndex(section);
    if (idx >= 0) {
      setTutorialStep(idx);
      setTutorialActive(true);
    }
  }, []);

  const stopTutorial = useCallback(() => {
    // Mark current section as completed
    const step = TUTORIAL_STEPS[tutorialStep];
    if (step) markSectionComplete(step.section);
    setTutorialActive(false);
    setTutorialStep(0);
  }, [tutorialStep, markSectionComplete]);

  const nextStep = useCallback(() => {
    setTutorialStep((s) => {
      const current = TUTORIAL_STEPS[s];
      const next = TUTORIAL_STEPS[s + 1];
      // Mark section complete when moving to next section
      if (current && next && current.section !== next.section) {
        markSectionComplete(current.section);
      }
      // Mark last section complete at end
      if (current && s + 1 >= TUTORIAL_STEPS.length) {
        markSectionComplete(current.section);
        setTutorialActive(false);
        return 0;
      }
      return s + 1;
    });
  }, [markSectionComplete]);

  const prevStep = useCallback(() => setTutorialStep((s) => Math.max(0, s - 1)), []);

  const skipSection = useCallback(() => {
    setTutorialStep((s) => {
      const current = TUTORIAL_STEPS[s];
      if (!current) return s;
      markSectionComplete(current.section);
      // Find first step of next section
      const currentSectionIdx = TUTORIAL_SECTIONS.findIndex((sec) => sec.id === current.section);
      const nextSection = TUTORIAL_SECTIONS[currentSectionIdx + 1];
      if (!nextSection) {
        setTutorialActive(false);
        return 0;
      }
      const idx = getFirstStepIndex(nextSection.id);
      return idx >= 0 ? idx : s;
    });
  }, [markSectionComplete]);

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

    if (data) {
      setProfile(data as Profile);

      // Auto-link: ensure this user has a member with their user_id
      if (data.family_id) {
        const { data: linked } = await supabase
          .from("members")
          .select("id")
          .eq("family_id", data.family_id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!linked) {
          // Try to find an unlinked member by name match
          const { data: allMembers } = await supabase
            .from("members")
            .select("id, name, user_id")
            .eq("family_id", data.family_id)
            .is("user_id", null);

          if (allMembers) {
            const firstName = (data.first_name || "").toLowerCase();
            const match = allMembers.find((m: { name: string }) => m.name.toLowerCase() === firstName);
            if (match) {
              await supabase.from("members").update({
                user_id: user.id,
                phone: data.phone || undefined,
              }).eq("id", match.id);
            }
          }
        }
      }
    }
    setReady(true);

    // Auto-subscribe to push notifications if not already done
    if (data && !localStorage.getItem("flowtime_push_asked")) {
      localStorage.setItem("flowtime_push_asked", "true");
      setTimeout(async () => {
        const already = await isPushSubscribed();
        if (!already) await subscribeToPush();
      }, 3000);
    }

    // Check onboarding — show for any user who hasn't completed it yet
    if (!localStorage.getItem("flowtime_onboarded") && data) {
      router.push("/onboarding");
    }

    // (tutorial_pending is handled in a separate effect)
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

  // Auto-start tutorial after onboarding redirect to /home
  useEffect(() => {
    if (pathname === "/home" && ready && !tutorialActive && localStorage.getItem("flowtime_tutorial_pending")) {
      localStorage.removeItem("flowtime_tutorial_pending");
      const t = setTimeout(() => {
        setTutorialStep(0);
        setTutorialActive(true);
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [pathname, ready, tutorialActive]);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="animate-pulse"><Logo size={60} /></div>
      </div>
    );
  }

  return (
    <I18nProvider initialLang={initialLang}>
      <ProfileContext.Provider value={{ profile, refreshProfile: loadProfile, chatUnread, openChat: () => setChatOpen(true), vieUnread, setVieUnread, appTheme, appThemeMode, setAppTheme }}>
        <TutorialContext.Provider value={{ tutorialActive, tutorialStep, currentSection, completedSections, startTutorial, startTutorialAtSection, stopTutorial, nextStep, prevStep, skipSection }}>
          <ToastProvider>
            <div
              key={transitionKey}
              className={`pb-[80px] ${slideDir === "left" ? "slide-from-right" : slideDir === "right" ? "slide-from-left" : "page-transition"}`}
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
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
                userAvatarUrl={profile.avatar_url}
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
              onSkipSection={skipSection}
              onJumpToSection={startTutorialAtSection}
            />
          </ToastProvider>
        </TutorialContext.Provider>
      </ProfileContext.Provider>
    </I18nProvider>
  );
}
