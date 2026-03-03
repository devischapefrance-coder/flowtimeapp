"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import Navbar from "@/components/Navbar";

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

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
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
  }

  useEffect(() => {
    // If user chose not to stay logged in, sign out when browser closes
    const sessionOnly = sessionStorage.getItem("flowtime_session_only");
    if (sessionOnly) {
      const handleUnload = () => { supabase.auth.signOut(); };
      window.addEventListener("beforeunload", handleUnload);
      return () => window.removeEventListener("beforeunload", handleUnload);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="text-[40px] animate-pulse">🌊</div>
      </div>
    );
  }

  return (
    <ProfileContext.Provider value={{ profile, refreshProfile: loadProfile }}>
      <div className="pb-[80px]">
        {children}
      </div>
      <Navbar />
    </ProfileContext.Provider>
  );
}
