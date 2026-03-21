"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { GameType } from "@/lib/types";

interface LeaderboardEntry {
  user_id: string;
  best_score: number;
  member_name: string;
  member_emoji: string;
}

interface GameLeaderboardProps {
  game: GameType;
  familyId: string;
  userId: string;
  limit?: number;
}

const GAME_LABELS: Record<GameType, string> = {
  snake: "Snake",
  tetris: "Tetris",
  flappy: "Flappy Bird",
  breakout: "Breakout",
  missile: "Missile Command",
};

const MEDALS = ["🥇", "🥈", "🥉"];

export default function GameLeaderboard({ game, familyId, userId, limit = 5 }: GameLeaderboardProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Charger les meilleurs scores par joueur
    const { data: scores } = await supabase
      .from("game_scores")
      .select("user_id, score")
      .eq("family_id", familyId)
      .eq("game", game)
      .order("score", { ascending: false });

    if (!scores || scores.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }

    // Grouper par user_id, garder le meilleur score
    const bestByUser = new Map<string, number>();
    for (const s of scores) {
      const current = bestByUser.get(s.user_id) || 0;
      if (s.score > current) bestByUser.set(s.user_id, s.score);
    }

    // Charger les noms des membres
    const { data: members } = await supabase
      .from("members")
      .select("user_id, name, emoji")
      .eq("family_id", familyId);

    const memberMap = new Map<string, { name: string; emoji: string }>();
    if (members) {
      for (const m of members) {
        if (m.user_id) memberMap.set(m.user_id, { name: m.name, emoji: m.emoji });
      }
    }

    const sorted = Array.from(bestByUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([uid, score]) => ({
        user_id: uid,
        best_score: score,
        member_name: memberMap.get(uid)?.name || "Joueur",
        member_emoji: memberMap.get(uid)?.emoji || "👤",
      }));

    setEntries(sorted);
    setLoading(false);
  }, [familyId, game, limit]);

  useEffect(() => {
    load();
  }, [load]);

  const myRank = entries.findIndex((e) => e.user_id === userId);
  const myBest = entries.find((e) => e.user_id === userId)?.best_score;

  if (loading) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs" style={{ color: "var(--dim)" }}>Chargement...</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-bold uppercase mb-3" style={{ color: "var(--dim)" }}>
        🏆 Meilleurs scores — {GAME_LABELS[game]}
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-center py-3" style={{ color: "var(--faint)" }}>
          Aucun score enregistré
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.map((entry, i) => (
            <div
              key={entry.user_id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl"
              style={{
                background: entry.user_id === userId ? "var(--accent-soft)" : "var(--surface2)",
                border: entry.user_id === userId ? "1px solid var(--accent)" : "1px solid transparent",
              }}
            >
              <span className="text-base w-6 text-center shrink-0">
                {i < 3 ? MEDALS[i] : `${i + 1}.`}
              </span>
              <span className="text-base">{entry.member_emoji}</span>
              <span className="text-sm font-medium flex-1">{entry.member_name}</span>
              <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                {entry.best_score.toLocaleString("fr-FR")} pts
              </span>
            </div>
          ))}
        </div>
      )}
      {myBest !== undefined && myRank >= 0 && (
        <p className="text-[10px] text-center mt-2" style={{ color: "var(--dim)" }}>
          Ton meilleur : {myBest.toLocaleString("fr-FR")} pts ({myRank + 1}{myRank === 0 ? "er" : "ème"})
        </p>
      )}
    </div>
  );
}
