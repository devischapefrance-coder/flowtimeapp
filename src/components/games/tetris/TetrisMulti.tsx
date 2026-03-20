"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { GameSession } from "@/lib/types";
import TetrisGame from "./TetrisGame";

interface TetrisMultiProps {
  familyId: string;
  userId: string;
  userName: string;
  onSaveScore: (score: number, level: number, lines: number) => void;
}

type MultiState = "menu" | "waiting" | "playing" | "finished";

export default function TetrisMulti({ familyId, userId, userName, onSaveScore }: TetrisMultiProps) {
  const [state, setState] = useState<MultiState>("menu");
  const [session, setSession] = useState<GameSession | null>(null);
  const [opponentName, setOpponentName] = useState("Adversaire");
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentAlive, setOpponentAlive] = useState(true);
  const [myScore, setMyScore] = useState(0);
  const [myAlive, setMyAlive] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);
  const [sessionCode, setSessionCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myScoreRef = useRef(0);
  const myAliveRef = useRef(true);

  // Créer une session
  const createSession = useCallback(async () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data } = await supabase
      .from("game_sessions")
      .insert({
        family_id: familyId,
        host_id: userId,
        status: "waiting",
        game: "tetris",
      })
      .select()
      .single();

    if (data) {
      setSession(data as GameSession);
      setSessionCode(code);
      setState("waiting");
      // Stocker le code dans localStorage pour le mapping
      localStorage.setItem(`game_session_${code}`, data.id);

      // Ecouter les changements de session
      const channel = supabase
        .channel(`tetris-session-${data.id}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "game_sessions",
          filter: `id=eq.${data.id}`,
        }, (payload) => {
          const updated = payload.new as GameSession;
          setSession(updated);
          if (updated.guest_id && updated.status === "playing") {
            // Le guest a rejoint et la partie commence
            loadOpponentName(updated.guest_id);
          }
          if (updated.status === "finished") {
            setState("finished");
            if (updated.winner_id === userId) setWinner("Toi");
            else setWinner(opponentName);
          }
        })
        .subscribe();

      channelRef.current = channel;
    }
  }, [familyId, userId, opponentName]);

  // Rejoindre une session
  const joinSession = useCallback(async () => {
    if (!joinCode.trim()) return;
    // Chercher la session par le code localStorage (simplifié)
    // En vrai on cherche les sessions en attente de la famille
    const { data: sessions } = await supabase
      .from("game_sessions")
      .select("*")
      .eq("family_id", familyId)
      .eq("status", "waiting")
      .is("guest_id", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!sessions || sessions.length === 0) return;

    // Prendre la première session disponible (pas la sienne)
    const target = sessions.find((s: GameSession) => s.host_id !== userId);
    if (!target) return;

    await supabase
      .from("game_sessions")
      .update({ guest_id: userId, status: "playing" })
      .eq("id", target.id);

    setSession(target as GameSession);
    loadOpponentName(target.host_id);
    setState("playing");

    // Broadcast channel
    setupBroadcast(target.id);
  }, [joinCode, familyId, userId]);

  const loadOpponentName = useCallback(async (oppId: string) => {
    const { data } = await supabase
      .from("members")
      .select("name")
      .eq("family_id", familyId)
      .eq("user_id", oppId)
      .single();
    if (data) setOpponentName(data.name);
  }, [familyId]);

  const setupBroadcast = useCallback((sessionId: string) => {
    // Cleanup précédent si existant
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);

    const channel = supabase
      .channel(`tetris-play-${sessionId}`)
      .on("broadcast", { event: "game_update" }, (payload) => {
        const p = payload.payload as { score: number; alive: boolean; userId: string };
        if (p.userId !== userId) {
          setOpponentScore(p.score);
          setOpponentAlive(p.alive);
        }
      })
      .subscribe();

    channelRef.current = channel;

    // Envoyer son état régulièrement (via refs pour eviter stale closure)
    intervalRef.current = setInterval(() => {
      channel.send({
        type: "broadcast",
        event: "game_update",
        payload: { score: myScoreRef.current, alive: myAliveRef.current, userId },
      });
    }, 1000);
  }, [userId]);

  // Lancer la partie quand un joueur rejoint (côté host)
  useEffect(() => {
    if (session?.guest_id && state === "waiting") {
      setState("playing");
      if (session.id) setupBroadcast(session.id);
      // Mettre à jour le status
      supabase.from("game_sessions").update({ status: "playing" }).eq("id", session.id);
    }
  }, [session?.guest_id, state, session?.id, setupBroadcast]);

  // Détecter fin de partie
  useEffect(() => {
    if (!opponentAlive && myAlive && state === "playing" && session) {
      // L'adversaire a perdu, on gagne
      setState("finished");
      setWinner("Toi");
      supabase.from("game_sessions").update({
        status: "finished",
        winner_id: userId,
        host_score: session.host_id === userId ? myScore : opponentScore,
        guest_score: session.host_id === userId ? opponentScore : myScore,
      }).eq("id", session.id);
    }
  }, [opponentAlive, myAlive, state, session, userId, myScore, opponentScore]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function handleGameOver(score: number, level: number, lines: number) {
    setMyScore(score);
    setMyAlive(false);
    myScoreRef.current = score;
    myAliveRef.current = false;
    onSaveScore(score, level, lines);

    // Broadcast qu'on a perdu
    if (channelRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "game_update",
        payload: { score, alive: false, userId },
      });
    }

    if (!opponentAlive) {
      setState("finished");
      setWinner(score > opponentScore ? "Toi" : opponentName);
    }
  }

  if (state === "menu") {
    return (
      <div className="flex flex-col gap-4">
        <button
          className="w-full py-3 rounded-xl font-bold text-sm"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={createSession}
        >
          🎮 Créer une partie
        </button>
        <div className="text-center text-xs font-bold uppercase" style={{ color: "var(--faint)" }}>ou</div>
        <div className="flex gap-2">
          <input
            className="flex-1 px-3 py-2.5 rounded-xl text-sm text-center uppercase tracking-wider"
            style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
            placeholder="Code partie"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          />
          <button
            className="px-4 py-2.5 rounded-xl font-bold text-sm shrink-0"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={joinSession}
          >
            Rejoindre
          </button>
        </div>
      </div>
    );
  }

  if (state === "waiting") {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4 animate-pulse">⏳</div>
        <p className="text-sm font-bold mb-2">En attente d'un adversaire...</p>
        <p className="text-xs mb-4" style={{ color: "var(--dim)" }}>
          Demande à un membre de ta famille de rejoindre depuis l'onglet Tetris Multi
        </p>
        <div className="inline-block px-4 py-2 rounded-xl text-lg font-bold tracking-widest" style={{ background: "var(--surface2)", color: "var(--accent)" }}>
          {sessionCode}
        </div>
        <button
          className="block mx-auto mt-6 text-xs"
          style={{ color: "var(--faint)" }}
          onClick={() => { setState("menu"); if (session) supabase.from("game_sessions").delete().eq("id", session.id); }}
        >
          Annuler
        </button>
      </div>
    );
  }

  if (state === "finished") {
    return (
      <div className="text-center py-8">
        <p className="text-4xl mb-3">🏆</p>
        <p className="text-lg font-bold mb-1">{winner === "Toi" ? "Tu as gagné !" : `${winner} a gagné !`}</p>
        <div className="flex justify-center gap-6 mt-4 mb-6">
          <div>
            <p className="text-xs" style={{ color: "var(--dim)" }}>{userName}</p>
            <p className="text-xl font-bold" style={{ color: winner === "Toi" ? "var(--accent)" : "var(--dim)" }}>{myScore}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: "var(--dim)" }}>{opponentName}</p>
            <p className="text-xl font-bold" style={{ color: winner !== "Toi" ? "var(--accent)" : "var(--dim)" }}>{opponentScore}</p>
          </div>
        </div>
        <button
          className="px-6 py-3 rounded-xl font-bold text-sm"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={() => { setState("menu"); setSession(null); setMyScore(0); setMyAlive(true); setOpponentScore(0); setOpponentAlive(true); }}
        >
          Retour au menu
        </button>
      </div>
    );
  }

  // Playing
  return (
    <div>
      {/* Bandeau adversaire */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl mb-3" style={{ background: "var(--surface2)" }}>
        <span className="text-xs font-bold">{opponentName}</span>
        <span className="text-xs font-bold" style={{ color: opponentAlive ? "var(--accent)" : "var(--red)" }}>
          {opponentAlive ? `${opponentScore} pts` : "💀 Eliminé"}
        </span>
      </div>
      <TetrisGame onGameOver={handleGameOver} />
    </div>
  );
}
