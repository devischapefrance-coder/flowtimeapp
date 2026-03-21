"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import type { GameSession } from "@/lib/types";

interface MissileMultiProps {
  familyId: string;
  userId: string;
  userName: string;
  onSaveScore: (score: number, wave: number) => void;
}

type MultiState = "menu" | "waiting" | "playing" | "finished";

const GROUND_HEIGHT = 32;
const BUILDING_COUNT = 6;
const EXPLOSION_MAX_RADIUS = 40;
const EXPLOSION_GROW_SPEED = 0.12;
const EXPLOSION_STABLE_DURATION = 200;
const EXPLOSION_FADE_SPEED = 0.003;
const WAVE_DURATION = 20000;
const WAVE_PAUSE = 3000;

interface Missile {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  speed: number;
  destroyed: boolean;
}

interface Explosion {
  id: string;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  phase: "growing" | "stable" | "fading";
  opacity: number;
  phaseStart: number;
  player: 1 | 2;
}

interface Building {
  id: number;
  x: number;
  alive: boolean;
  zone: 1 | 2;
}

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

export default function MissileMulti({ familyId, userId, userName, onSaveScore }: MissileMultiProps) {
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

  // Multi state refs
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const myScoreRef = useRef(0);
  const myAliveRef = useRef(true);
  const stateRef = useRef<MultiState>("menu");

  // Game state for local split-screen
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(360);
  const [canvasHeight, setCanvasHeight] = useState(576);
  const canvasWRef = useRef(360);
  const canvasHRef = useRef(576);
  const animFrameRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const missilesRef = useRef<Missile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const buildingsRef = useRef<Building[]>([]);
  const waveRef = useRef(1);
  const waveStartRef = useRef(0);
  const betweenWavesRef = useRef(false);
  const pauseEndRef = useRef(0);
  const waveSpawnedRef = useRef(false);
  const gameOverRef = useRef(false);
  const p1ScoreRef = useRef(0);
  const p2ScoreRef = useRef(0);
  const [p1Score, setP1Score] = useState(0);
  const [p2Score, setP2Score] = useState(0);
  const [wave, setWave] = useState(1);
  const [betweenWaves, setBetweenWaves] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [localWinner, setLocalWinner] = useState<1 | 2 | null>(null);
  const [buildingStates, setBuildingStates] = useState<{ alive: boolean; zone: 1 | 2 }[]>([]);

  const stars = useMemo<Star[]>(() => {
    const result: Star[] = [];
    for (let i = 0; i < 60; i++) {
      result.push({ x: Math.random() * 430, y: Math.random() * 600, size: Math.random() < 0.3 ? 2 : 1, opacity: 0.3 + Math.random() * 0.5 });
    }
    return result;
  }, []);

  // Canvas sizing
  useEffect(() => {
    const resize = () => {
      const w = Math.min(window.innerWidth - 32, 400);
      const h = Math.round(w * 1.6);
      setCanvasWidth(w);
      setCanvasHeight(h);
      canvasWRef.current = w;
      canvasHRef.current = h;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }, [canvasWidth, canvasHeight]);

  const initBuildings = useCallback((w: number): Building[] => {
    const half = w / 2;
    const margin = half * 0.12;
    const perZone = BUILDING_COUNT / 2;
    const spacing1 = (half - margin * 2) / (perZone - 1);
    const spacing2 = (half - margin * 2) / (perZone - 1);
    const buildings: Building[] = [];
    for (let i = 0; i < perZone; i++) {
      buildings.push({ id: i, x: margin + i * spacing1, alive: true, zone: 1 });
    }
    for (let i = 0; i < perZone; i++) {
      buildings.push({ id: perZone + i, x: half + margin + i * spacing2, alive: true, zone: 2 });
    }
    return buildings;
  }, []);

  const spawnWave = useCallback((waveNum: number) => {
    const count = 3 + (waveNum - 1) * 2;
    const speed = 0.06 * (1 + (waveNum - 1) * 0.15);
    const w = canvasWRef.current;
    const h = canvasHRef.current;
    const groundY = h - GROUND_HEIGHT;
    const aliveBuildings = buildingsRef.current.filter((b) => b.alive);
    if (aliveBuildings.length === 0) return;

    const newMissiles: Missile[] = Array.from({ length: count }, (_, i) => {
      const target = aliveBuildings[Math.floor(Math.random() * aliveBuildings.length)];
      return {
        id: `${waveNum}-${i}-${Date.now()}`,
        x: Math.random() * w,
        y: -(Math.random() * 100),
        targetX: target.x,
        targetY: groundY,
        speed,
        destroyed: false,
      };
    });

    missilesRef.current = [...missilesRef.current, ...newMissiles];
  }, []);

  const updateMissiles = useCallback((delta: number) => {
    const groundY = canvasHRef.current - GROUND_HEIGHT;
    let buildingsChanged = false;

    for (const m of missilesRef.current) {
      if (m.destroyed) continue;
      const dx = m.targetX - m.x;
      const dy = m.targetY - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 8) {
        m.destroyed = true;
        for (const b of buildingsRef.current) {
          if (b.alive && Math.abs(b.x - m.targetX) < 20) {
            b.alive = false;
            buildingsChanged = true;
            break;
          }
        }
        continue;
      }
      const step = m.speed * delta;
      m.x += (dx / dist) * step;
      m.y += (dy / dist) * step;
      if (m.y >= groundY) m.destroyed = true;
    }

    if (buildingsChanged) {
      setBuildingStates(buildingsRef.current.map((b) => ({ alive: b.alive, zone: b.zone })));
    }
  }, []);

  const updateExplosions = useCallback((delta: number, timestamp: number) => {
    const alive: Explosion[] = [];
    for (const exp of explosionsRef.current) {
      if (exp.phase === "growing") {
        exp.radius += EXPLOSION_GROW_SPEED * delta;
        if (exp.radius >= exp.maxRadius) {
          exp.radius = exp.maxRadius;
          exp.phase = "stable";
          exp.phaseStart = timestamp;
        }
        alive.push(exp);
      } else if (exp.phase === "stable") {
        if (timestamp - exp.phaseStart > EXPLOSION_STABLE_DURATION) exp.phase = "fading";
        alive.push(exp);
      } else {
        exp.opacity -= EXPLOSION_FADE_SPEED * delta;
        if (exp.opacity > 0) alive.push(exp);
      }
    }
    explosionsRef.current = alive;
  }, []);

  const checkCollisions = useCallback(() => {
    const destroyed = new Set<string>();
    const hitsByPlayer = new Map<1 | 2, number>();

    for (const exp of explosionsRef.current) {
      if (exp.phase === "fading" && exp.opacity < 0.3) continue;
      for (const m of missilesRef.current) {
        if (m.destroyed || destroyed.has(m.id)) continue;
        const dx = m.x - exp.x;
        const dy = m.y - exp.y;
        if (Math.sqrt(dx * dx + dy * dy) <= exp.radius) {
          destroyed.add(m.id);
          hitsByPlayer.set(exp.player, (hitsByPlayer.get(exp.player) ?? 0) + 1);
        }
      }
    }

    if (destroyed.size === 0) return;

    // Attribuer les points par joueur
    hitsByPlayer.forEach((count, player) => {
      const points = 25 * waveRef.current * count;
      if (player === 1) {
        p1ScoreRef.current += points;
        setP1Score(p1ScoreRef.current);
      } else {
        p2ScoreRef.current += points;
        setP2Score(p2ScoreRef.current);
      }
    });

    for (const m of missilesRef.current) {
      if (destroyed.has(m.id)) m.destroyed = true;
    }
  }, []);

  const checkGameOver = useCallback(() => {
    const zone1Alive = buildingsRef.current.filter((b) => b.zone === 1 && b.alive).length;
    const zone2Alive = buildingsRef.current.filter((b) => b.zone === 2 && b.alive).length;

    if (zone1Alive === 0 || zone2Alive === 0) {
      gameOverRef.current = true;
      setGameOver(true);
      document.body.style.overflow = "";

      if (zone1Alive === 0 && zone2Alive === 0) {
        setLocalWinner(p1ScoreRef.current >= p2ScoreRef.current ? 1 : 2);
      } else if (zone1Alive === 0) {
        setLocalWinner(2);
      } else {
        setLocalWinner(1);
      }

      const totalScore = p1ScoreRef.current + p2ScoreRef.current;
      myScoreRef.current = totalScore;
      setMyScore(totalScore);
      onSaveScore(totalScore, waveRef.current);
    }
  }, [onSaveScore]);

  const checkWaveEnd = useCallback((timestamp: number) => {
    if (betweenWavesRef.current) return;
    const elapsed = timestamp - waveStartRef.current;
    const activeMissiles = missilesRef.current.filter((m) => !m.destroyed);

    if (elapsed >= WAVE_DURATION && activeMissiles.length === 0) {
      const survivedCount = buildingsRef.current.filter((b) => b.alive).length;
      const bonus = survivedCount * 100;
      // Répartir le bonus
      p1ScoreRef.current += Math.floor(bonus / 2);
      p2ScoreRef.current += Math.floor(bonus / 2);
      setP1Score(p1ScoreRef.current);
      setP2Score(p2ScoreRef.current);

      // Reconstruire un bâtiment par zone
      for (const zone of [1, 2] as const) {
        const dead = buildingsRef.current.find((b) => b.zone === zone && !b.alive);
        if (dead) dead.alive = true;
      }
      setBuildingStates(buildingsRef.current.map((b) => ({ alive: b.alive, zone: b.zone })));

      betweenWavesRef.current = true;
      setBetweenWaves(true);
      pauseEndRef.current = timestamp + WAVE_PAUSE;
      waveSpawnedRef.current = false;
    }
  }, []);

  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvasWRef.current;
    const h = canvasHRef.current;
    const groundY = h - GROUND_HEIGHT;

    ctx.fillStyle = "#05080F";
    ctx.fillRect(0, 0, w, h);

    for (const star of stars) {
      const sx = (star.x / 430) * w;
      const sy = (star.y / 600) * h;
      ctx.fillStyle = `rgba(255,255,255,${star.opacity})`;
      ctx.fillRect(sx, sy, star.size, star.size);
    }

    // Ligne de séparation centrale
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, groundY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels joueurs
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillText("J1", w / 4, 14);
    ctx.fillText("J2", (3 * w) / 4, 14);

    // Sol
    ctx.fillStyle = "#1A2A1A";
    ctx.fillRect(0, groundY, w, GROUND_HEIGHT);
    ctx.fillStyle = "#2A3A2A";
    ctx.fillRect(0, groundY, w, 2);

    // Bâtiments
    for (const b of buildingsRef.current) {
      if (!b.alive) {
        ctx.fillStyle = "#2A1A0A";
        ctx.fillRect(b.x - 8, groundY - 6, 16, 6);
        continue;
      }
      ctx.fillStyle = "#3A5A3A";
      ctx.fillRect(b.x - 10, groundY - 24, 20, 24);
      ctx.fillStyle = "#4A6A4A";
      ctx.fillRect(b.x - 10, groundY - 24, 20, 3);
      ctx.fillStyle = "#7CE87C";
      for (const [wx, wy] of [[b.x - 6, groundY - 20], [b.x + 2, groundY - 20], [b.x - 6, groundY - 12], [b.x + 2, groundY - 12]]) {
        ctx.fillRect(wx, wy, 4, 4);
      }
    }

    // Missiles
    for (const m of missilesRef.current) {
      if (m.destroyed) continue;
      ctx.strokeStyle = "rgba(232, 124, 124, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(m.x, Math.max(0, m.y - 60));
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#E87C7C";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Explosions
    for (const exp of explosionsRef.current) {
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(232, 168, 124, ${exp.opacity * 0.3})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(240, 200, 160, ${exp.opacity * 0.8})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 240, 200, ${exp.opacity * 0.6})`;
      ctx.fill();
    }
  }, [stars]);

  const gameLoop = useCallback((timestamp: number) => {
    if (gameOverRef.current) return;
    const delta = Math.min(timestamp - lastTimestampRef.current, 32);
    lastTimestampRef.current = timestamp;

    if (betweenWavesRef.current) {
      const remaining = Math.ceil((pauseEndRef.current - timestamp) / 1000);
      setCountdown(Math.max(0, remaining));
      if (timestamp >= pauseEndRef.current) {
        betweenWavesRef.current = false;
        setBetweenWaves(false);
        waveRef.current++;
        setWave(waveRef.current);
        waveStartRef.current = timestamp;
        waveSpawnedRef.current = false;
      }
      render(timestamp);
      animFrameRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    if (!waveSpawnedRef.current) {
      spawnWave(waveRef.current);
      waveSpawnedRef.current = true;
    }

    updateMissiles(delta);
    updateExplosions(delta, timestamp);
    checkCollisions();
    checkGameOver();
    checkWaveEnd(timestamp);
    render(timestamp);

    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [spawnWave, updateMissiles, updateExplosions, checkCollisions, checkGameOver, checkWaveEnd, render]);

  const startLocalGame = useCallback(() => {
    const w = canvasWRef.current;
    p1ScoreRef.current = 0;
    p2ScoreRef.current = 0;
    waveRef.current = 1;
    gameOverRef.current = false;
    betweenWavesRef.current = false;
    waveSpawnedRef.current = false;
    missilesRef.current = [];
    explosionsRef.current = [];
    buildingsRef.current = initBuildings(w);

    setP1Score(0);
    setP2Score(0);
    setWave(1);
    setGameOver(false);
    setLocalWinner(null);
    setBetweenWaves(false);
    setBuildingStates(buildingsRef.current.map((b) => ({ alive: b.alive, zone: b.zone })));

    document.body.style.overflow = "hidden";
    lastTimestampRef.current = performance.now();
    waveStartRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [initBuildings, gameLoop]);

  // Tap handling — multi-touch, each player in their zone
  const handleTap = useCallback((e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    if (gameOverRef.current || betweenWavesRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = canvasWRef.current;
    const h = canvasHRef.current;
    const now = performance.now();

    if ("touches" in e) {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const x = (touch.clientX - rect.left) * (w / rect.width);
        const y = (touch.clientY - rect.top) * (h / rect.height);
        const player: 1 | 2 = x < w / 2 ? 1 : 2;
        explosionsRef.current.push({
          id: `exp-${now}-${i}`,
          x, y,
          radius: 0,
          maxRadius: EXPLOSION_MAX_RADIUS,
          phase: "growing",
          opacity: 1,
          phaseStart: now,
          player,
        });
      }
    } else {
      const x = (e.clientX - rect.left) * (w / rect.width);
      const y = (e.clientY - rect.top) * (h / rect.height);
      const player: 1 | 2 = x < w / 2 ? 1 : 2;
      explosionsRef.current.push({
        id: `exp-${now}`,
        x, y,
        radius: 0,
        maxRadius: EXPLOSION_MAX_RADIUS,
        phase: "growing",
        opacity: 1,
        phaseStart: now,
        player,
      });
    }
  }, []);

  // ---- Networking (same pattern as TetrisMulti/BreakoutMulti) ----
  const loadOpponentName = useCallback(async (oppId: string) => {
    const { data } = await supabase.from("members").select("name").eq("family_id", familyId).eq("user_id", oppId).single();
    if (data) setOpponentName(data.name);
  }, [familyId]);

  const setupBroadcast = useCallback((sessionId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    const channel = supabase
      .channel(`missile-play-${sessionId}`)
      .on("broadcast", { event: "game_update" }, (payload) => {
        const p = payload.payload as { score: number; alive: boolean; userId: string };
        if (p.userId !== userId) {
          setOpponentScore(p.score);
          setOpponentAlive(p.alive);
        }
      })
      .subscribe();
    channelRef.current = channel;
    intervalRef.current = setInterval(() => {
      channel.send({ type: "broadcast", event: "game_update", payload: { score: myScoreRef.current, alive: myAliveRef.current, userId } });
    }, 1000);
  }, [userId]);

  const startGameAsHost = useCallback((sessionId: string, guestId: string) => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    setState("playing");
    stateRef.current = "playing";
    loadOpponentName(guestId);
    setupBroadcast(sessionId);
    startLocalGame();
  }, [loadOpponentName, setupBroadcast, startLocalGame]);

  const createSession = useCallback(async () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data } = await supabase.from("game_sessions").insert({ family_id: familyId, host_id: userId, status: "waiting", game: "missile" }).select().single();
    if (data) {
      setSession(data as GameSession);
      setSessionCode(code);
      setState("waiting");
      stateRef.current = "waiting";
      localStorage.setItem(`game_session_${code}`, data.id);

      const channel = supabase.channel(`missile-session-${data.id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_sessions", filter: `id=eq.${data.id}` }, (payload) => {
          const updated = payload.new as GameSession;
          setSession(updated);
          if (updated.guest_id && stateRef.current === "waiting") startGameAsHost(updated.id, updated.guest_id);
          if (updated.status === "finished") { setState("finished"); stateRef.current = "finished"; if (updated.winner_id === userId) setWinner("Toi"); else setWinner(opponentName); }
        }).subscribe();
      channelRef.current = channel;

      pollingRef.current = setInterval(async () => {
        if (stateRef.current !== "waiting") { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } return; }
        const { data: fresh } = await supabase.from("game_sessions").select("*").eq("id", data.id).single();
        if (fresh && fresh.guest_id && stateRef.current === "waiting") { setSession(fresh as GameSession); startGameAsHost(fresh.id, fresh.guest_id); }
      }, 2000);
    }
  }, [familyId, userId, opponentName, startGameAsHost]);

  const joinSession = useCallback(async () => {
    if (!joinCode.trim()) return;
    const { data: sessions } = await supabase.from("game_sessions").select("*").eq("family_id", familyId).eq("status", "waiting").eq("game", "missile").is("guest_id", null).order("created_at", { ascending: false }).limit(5);
    if (!sessions || sessions.length === 0) return;
    const target = sessions.find((s: GameSession) => s.host_id !== userId);
    if (!target) return;
    await supabase.from("game_sessions").update({ guest_id: userId, status: "playing", updated_at: new Date().toISOString() }).eq("id", target.id);
    setSession(target as GameSession);
    loadOpponentName(target.host_id);
    setState("playing");
    stateRef.current = "playing";
    setupBroadcast(target.id);
    startLocalGame();
  }, [joinCode, familyId, userId, loadOpponentName, setupBroadcast, startLocalGame]);

  // Detect remote opponent end
  useEffect(() => {
    if (!opponentAlive && myAlive && state === "playing" && session) {
      setState("finished");
      setWinner("Toi");
      supabase.from("game_sessions").update({ status: "finished", winner_id: userId, host_score: session.host_id === userId ? myScore : opponentScore, guest_score: session.host_id === userId ? opponentScore : myScore }).eq("id", session.id);
    }
  }, [opponentAlive, myAlive, state, session, userId, myScore, opponentScore]);

  // When local game ends, broadcast
  useEffect(() => {
    if (gameOver && state === "playing") {
      myAliveRef.current = false;
      setMyAlive(false);
      if (channelRef.current) {
        channelRef.current.send({ type: "broadcast", event: "game_update", payload: { score: myScoreRef.current, alive: false, userId } });
      }
      if (!opponentAlive) {
        setState("finished");
        setWinner(myScoreRef.current > opponentScore ? "Toi" : opponentName);
      }
    }
  }, [gameOver, state, userId, opponentAlive, opponentScore, opponentName]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (pollingRef.current) clearInterval(pollingRef.current);
      document.body.style.overflow = "";
    };
  }, []);

  if (state === "menu") {
    return (
      <div className="flex flex-col gap-4">
        <button className="w-full py-3 rounded-xl font-bold text-sm" style={{ background: "var(--accent)", color: "#fff" }} onClick={createSession}>
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
          <button className="px-4 py-2.5 rounded-xl font-bold text-sm shrink-0" style={{ background: "var(--accent)", color: "#fff" }} onClick={joinSession}>
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
        <p className="text-sm font-bold mb-2">En attente d&apos;un adversaire...</p>
        <p className="text-xs mb-4" style={{ color: "var(--dim)" }}>Demande à un membre de ta famille de rejoindre</p>
        <div className="inline-block px-4 py-2 rounded-xl text-lg font-bold tracking-widest" style={{ background: "var(--surface2)", color: "var(--accent)" }}>{sessionCode}</div>
        <button className="block mx-auto mt-6 text-xs" style={{ color: "var(--faint)" }} onClick={() => { setState("menu"); stateRef.current = "menu"; if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } if (session) supabase.from("game_sessions").delete().eq("id", session.id); }}>
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
        <button className="px-6 py-3 rounded-xl font-bold text-sm" style={{ background: "var(--accent)", color: "#fff" }} onClick={() => { setState("menu"); stateRef.current = "menu"; setSession(null); setMyScore(0); setMyAlive(true); myAliveRef.current = true; myScoreRef.current = 0; setOpponentScore(0); setOpponentAlive(true); }}>
          Retour au menu
        </button>
      </div>
    );
  }

  // Playing
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Scores J1 / J2 */}
      <div className="flex justify-between items-center w-full px-1" style={{ maxWidth: canvasWidth }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px]" style={{ color: "var(--dim)" }}>Vague</span>
          <span className="text-lg font-bold">{wave}</span>
        </div>
        <div className="flex gap-4">
          <div className="text-center">
            <p className="text-[9px]" style={{ color: "var(--dim)" }}>J1</p>
            <p className="text-xs font-bold" style={{ color: "var(--accent)" }}>{p1Score}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px]" style={{ color: "var(--dim)" }}>J2</p>
            <p className="text-xs font-bold" style={{ color: "var(--teal)" }}>{p2Score}</p>
          </div>
        </div>
        <div className="flex gap-0.5">
          {buildingStates.map((b, i) => (
            <div key={i} style={{ width: 6, height: 10, borderRadius: 1, background: b.alive ? (b.zone === 1 ? "var(--accent)" : "var(--teal)") : "var(--dim)", opacity: b.alive ? 1 : 0.3 }} />
          ))}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="rounded-xl"
        onTouchStart={handleTap}
        onClick={handleTap}
        style={{ background: "#05080F", border: "1px solid var(--glass-border)", touchAction: "none", display: "block", width: canvasWidth, height: canvasHeight }}
      />

      {betweenWaves && (
        <div className="text-center py-2">
          <p className="text-sm font-bold">Vague {wave} terminée !</p>
          <p className="text-xs" style={{ color: "var(--dim)" }}>Prochaine vague dans {countdown}s</p>
        </div>
      )}

      {gameOver && (
        <div className="text-center">
          <p className="text-lg font-bold mb-1">{localWinner === 1 ? "Joueur 1 gagne !" : "Joueur 2 gagne !"}</p>
          <p className="text-xs mb-3" style={{ color: "var(--dim)" }}>{wave} vague{wave > 1 ? "s" : ""}</p>
          <button className="px-6 py-3 rounded-xl font-bold text-sm" style={{ background: "var(--accent)", color: "#fff" }} onClick={startLocalGame}>
            Rejouer
          </button>
        </div>
      )}
    </div>
  );
}
