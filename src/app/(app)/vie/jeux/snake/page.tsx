"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../../../layout";
import dynamic from "next/dynamic";
import GameLeaderboard from "@/components/games/GameLeaderboard";

const SnakeGame = dynamic(() => import("@/components/games/snake/SnakeGame"), { ssr: false });

export default function SnakePage() {
  const router = useRouter();
  const { profile } = useProfile();
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const handleGameOver = useCallback(async (score: number) => {
    if (!profile?.family_id || !profile?.id) return;
    // Sauvegarder le score
    await supabase.from("game_scores").insert({
      user_id: profile.id,
      family_id: profile.family_id,
      game: "snake",
      score,
    });
    // Vérifier record perso
    const { data } = await supabase
      .from("game_scores")
      .select("score")
      .eq("user_id", profile.id)
      .eq("game", "snake")
      .order("score", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setBestScore(data[0].score);
      setIsNewRecord(score >= data[0].score);
    }
  }, [profile?.family_id, profile?.id]);

  return (
    <div className="px-4 py-4 animate-in gradient-bg" style={{ minHeight: "100dvh", paddingBottom: 40 }}>
      <div className="flex items-center gap-3 mb-4">
        <button
          className="w-10 h-10 flex items-center justify-center rounded-full text-lg active:scale-90 transition-transform"
          style={{ background: "var(--surface2)" }}
          onClick={() => router.push("/vie?tab=jeux")}
        >
          ←
        </button>
        <h1 className="text-lg font-bold">🐍 Snake</h1>
        <div className="flex-1" />
        <button
          className="px-3 py-1.5 rounded-xl text-xs font-bold"
          style={{ background: "var(--surface2)", color: "var(--accent)" }}
          onClick={() => setShowLeaderboard(!showLeaderboard)}
        >
          🏆 Scores
        </button>
      </div>

      {isNewRecord && (
        <div className="text-center mb-3 py-2 rounded-xl" style={{ background: "color-mix(in srgb, var(--warm) 15%, transparent)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--warm)" }}>🏆 Nouveau record !</p>
        </div>
      )}

      {bestScore !== null && !isNewRecord && (
        <p className="text-center text-xs mb-3" style={{ color: "var(--dim)" }}>
          Ton record : {bestScore} pts
        </p>
      )}

      <SnakeGame onGameOver={handleGameOver} />

      {showLeaderboard && profile?.family_id && profile?.id && (
        <div className="mt-6 card">
          <GameLeaderboard game="snake" familyId={profile.family_id} userId={profile.id} />
        </div>
      )}

      <p className="text-center text-[10px] mt-4" style={{ color: "var(--faint)" }}>
        Swipe ou flèches pour diriger · +10 pts par pomme
      </p>
    </div>
  );
}
