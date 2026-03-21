"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../../../layout";
import dynamic from "next/dynamic";
import GameLeaderboard from "@/components/games/GameLeaderboard";

const BreakoutGame = dynamic(() => import("@/components/games/breakout/BreakoutGame"), { ssr: false });
const BreakoutMulti = dynamic(() => import("@/components/games/breakout/BreakoutMulti"), { ssr: false });

export default function BreakoutPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const [mode, setMode] = useState<"solo" | "multi">("solo");
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const saveScore = useCallback(async (score: number, level: number) => {
    if (!profile?.family_id || !profile?.id) return;
    await supabase.from("game_scores").insert({
      user_id: profile.id,
      family_id: profile.family_id,
      game: "breakout",
      score,
      level,
    });
    const { data } = await supabase
      .from("game_scores")
      .select("score")
      .eq("user_id", profile.id)
      .eq("game", "breakout")
      .order("score", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setBestScore(data[0].score);
      setIsNewRecord(score >= data[0].score);
    }
  }, [profile?.family_id, profile?.id]);

  const handleSoloGameOver = useCallback((score: number, level: number) => {
    saveScore(score, level);
  }, [saveScore]);

  return (
    <div
      className="px-4 py-4 animate-in gradient-bg"
      style={{
        minHeight: "100dvh",
        paddingBottom: "calc(65px + env(safe-area-inset-bottom, 0px))",
        overflowY: "auto",
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <button
          className="w-10 h-10 flex items-center justify-center rounded-full text-lg active:scale-90 transition-transform"
          style={{ background: "var(--surface2)" }}
          onClick={() => router.push("/vie?tab=jeux")}
        >
          ←
        </button>
        <h1 className="text-lg font-bold">🧱 Breakout</h1>
        <div className="flex-1" />
        <button
          className="px-3 py-1.5 rounded-xl text-xs font-bold"
          style={{ background: "var(--surface2)", color: "var(--accent)" }}
          onClick={() => setShowLeaderboard(!showLeaderboard)}
        >
          🏆 Scores
        </button>
      </div>

      {/* Mode switcher */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: "var(--surface)" }}>
        <button
          className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: mode === "solo" ? "var(--accent)" : "transparent", color: mode === "solo" ? "#fff" : "var(--dim)" }}
          onClick={() => setMode("solo")}
        >
          Solo
        </button>
        <button
          className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
          style={{ background: mode === "multi" ? "var(--accent)" : "transparent", color: mode === "multi" ? "#fff" : "var(--dim)" }}
          onClick={() => setMode("multi")}
        >
          🆚 Multi
        </button>
      </div>

      {isNewRecord && (
        <div className="text-center mb-3 py-2 rounded-xl" style={{ background: "color-mix(in srgb, var(--warm) 15%, transparent)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--warm)" }}>🏆 Nouveau record !</p>
        </div>
      )}

      {bestScore !== null && !isNewRecord && (
        <p className="text-center text-xs mb-3" style={{ color: "var(--dim)" }}>
          Ton record : {bestScore.toLocaleString("fr-FR")} pts
        </p>
      )}

      {mode === "solo" ? (
        <BreakoutGame onGameOver={handleSoloGameOver} />
      ) : (
        profile?.family_id && profile?.id && (
          <BreakoutMulti
            familyId={profile.family_id}
            userId={profile.id}
            userName={profile.first_name || "Joueur"}
            onSaveScore={saveScore}
          />
        )
      )}

      {showLeaderboard && profile?.family_id && profile?.id && (
        <div className="mt-6 card">
          <GameLeaderboard game="breakout" familyId={profile.family_id} userId={profile.id} />
        </div>
      )}

      <p className="text-center text-[10px] mt-4" style={{ color: "var(--faint)" }}>
        {mode === "solo" ? "Glisse ou utilise les flèches · Espace pour lancer" : "Défie un membre de ta famille !"}
      </p>
    </div>
  );
}
