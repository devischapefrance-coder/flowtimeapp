"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useProfile } from "../../layout";
import type { GameType } from "@/lib/types";

interface GameInfo {
  id: GameType;
  name: string;
  emoji: string;
  description: string;
  multi?: boolean;
}

const GAMES: GameInfo[] = [
  { id: "snake", name: "Snake", emoji: "🐍", description: "Mange les pommes sans te mordre !" },
  { id: "tetris", name: "Tetris", emoji: "🧱", description: "Empile et complète les lignes", multi: true },
  { id: "flappy", name: "Flappy Bird", emoji: "🐤", description: "Passe entre les tuyaux" },
];

interface ScoreInfo {
  myBest: number;
  familyBest: number;
  familyBestName: string;
  familyBestEmoji: string;
}

export default function JeuxHubPage() {
  const router = useRouter();
  const { profile } = useProfile();
  const [scores, setScores] = useState<Record<string, ScoreInfo>>({});

  const loadScores = useCallback(async () => {
    if (!profile?.family_id || !profile?.id) return;

    const { data: allScores } = await supabase
      .from("game_scores")
      .select("user_id, game, score")
      .eq("family_id", profile.family_id)
      .order("score", { ascending: false });

    if (!allScores) return;

    const { data: members } = await supabase
      .from("members")
      .select("user_id, name, emoji")
      .eq("family_id", profile.family_id);

    const memberMap = new Map<string, { name: string; emoji: string }>();
    if (members) {
      for (const m of members) {
        if (m.user_id) memberMap.set(m.user_id, { name: m.name, emoji: m.emoji });
      }
    }

    const result: Record<string, ScoreInfo> = {};
    for (const game of GAMES) {
      const gameScores = allScores.filter((s) => s.game === game.id);
      const myScores = gameScores.filter((s) => s.user_id === profile.id);
      const myBest = myScores.length > 0 ? Math.max(...myScores.map((s) => s.score)) : 0;

      let familyBest = 0;
      let familyBestName = "";
      let familyBestEmoji = "";
      if (gameScores.length > 0) {
        const best = gameScores[0]; // déjà trié DESC
        familyBest = best.score;
        const member = memberMap.get(best.user_id);
        familyBestName = member?.name || "Joueur";
        familyBestEmoji = member?.emoji || "👤";
      }

      result[game.id] = { myBest, familyBest, familyBestName, familyBestEmoji };
    }
    setScores(result);
  }, [profile?.family_id, profile?.id]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  return (
    <div className="px-4 py-4 animate-in gradient-bg" style={{ minHeight: "100dvh", paddingBottom: 80 }}>
      <div className="flex items-center gap-3 mb-5">
        <button
          className="w-10 h-10 flex items-center justify-center rounded-full text-lg active:scale-90 transition-transform"
          style={{ background: "var(--surface2)" }}
          onClick={() => router.back()}
        >
          ←
        </button>
        <h1 className="text-xl font-bold">🎮 Jeux famille</h1>
      </div>

      <div className="flex flex-col gap-3">
        {GAMES.map((game) => {
          const info = scores[game.id];
          return (
            <button
              key={game.id}
              className="card !mb-0 text-left active:scale-[0.98] transition-transform"
              onClick={() => router.push(`/vie/jeux/${game.id}`)}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ background: "var(--accent-soft)" }}
                >
                  {game.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold">{game.name}</p>
                    {game.multi && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "color-mix(in srgb, var(--teal) 15%, transparent)", color: "var(--teal)" }}>
                        MULTI
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] mb-2" style={{ color: "var(--dim)" }}>{game.description}</p>
                  {info && (
                    <div className="flex gap-4">
                      {info.myBest > 0 && (
                        <p className="text-[10px]" style={{ color: "var(--accent)" }}>
                          👤 {info.myBest.toLocaleString("fr-FR")} pts
                        </p>
                      )}
                      {info.familyBest > 0 && (
                        <p className="text-[10px]" style={{ color: "var(--warm)" }}>
                          🏆 {info.familyBestEmoji} {info.familyBestName} · {info.familyBest.toLocaleString("fr-FR")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-sm mt-2 shrink-0" style={{ color: "var(--faint)" }}>›</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
