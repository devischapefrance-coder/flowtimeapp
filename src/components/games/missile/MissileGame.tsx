"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";

interface MissileGameProps {
  onGameOver: (score: number, wave: number) => void;
}

const GROUND_HEIGHT = 32;
const EXPLOSION_MAX_RADIUS = 40;
const EXPLOSION_GROW_SPEED = 0.12;
const EXPLOSION_STABLE_DURATION = 200;
const EXPLOSION_FADE_SPEED = 0.003;
const WAVE_DURATION = 20000;
const WAVE_PAUSE = 3000;
const BUILDING_COUNT = 6;

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
}

interface Building {
  id: number;
  x: number;
  alive: boolean;
}

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

export default function MissileGame({ onGameOver }: MissileGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(360);
  const [canvasHeight, setCanvasHeight] = useState(576);
  const [betweenWaves, setBetweenWaves] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [buildingStates, setBuildingStates] = useState<boolean[]>(Array(BUILDING_COUNT).fill(true));

  const scoreRef = useRef(0);
  const waveRef = useRef(1);
  const gameOverRef = useRef(false);
  const startedRef = useRef(false);
  const animFrameRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const canvasWRef = useRef(360);
  const canvasHRef = useRef(576);

  const missilesRef = useRef<Missile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const buildingsRef = useRef<Building[]>([]);
  const waveStartRef = useRef(0);
  const betweenWavesRef = useRef(false);
  const pauseEndRef = useRef(0);
  const waveSpawnedRef = useRef(false);
  const comboTextRef = useRef<{ text: string; x: number; y: number; until: number } | null>(null);

  // Couleurs accent résolues au mount
  const accentColorRef = useRef("#7C6BF0");

  // Étoiles générées une seule fois
  const stars = useMemo<Star[]>(() => {
    const result: Star[] = [];
    for (let i = 0; i < 60; i++) {
      result.push({
        x: Math.random() * 430,
        y: Math.random() * 600,
        size: Math.random() < 0.3 ? 2 : 1,
        opacity: 0.3 + Math.random() * 0.5,
      });
    }
    return result;
  }, []);

  // Résoudre la couleur accent
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue("--accent").trim();
    if (accent) accentColorRef.current = accent;
  }, []);

  // Canvas sizing dynamique
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

  // Redimensionner le canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }, [canvasWidth, canvasHeight]);

  // Initialiser les bâtiments
  const initBuildings = useCallback((w: number): Building[] => {
    const margin = w * 0.08;
    const spacing = (w - margin * 2) / (BUILDING_COUNT - 1);
    return Array.from({ length: BUILDING_COUNT }, (_, i) => ({
      id: i,
      x: margin + i * spacing,
      alive: true,
    }));
  }, []);

  // Spawn une vague de missiles
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
        y: 0,
        targetX: target.x,
        targetY: groundY,
        speed,
        destroyed: false,
      };
    });

    // Échelonner le spawn : certains missiles partent en retard
    for (let i = 0; i < newMissiles.length; i++) {
      newMissiles[i].y = -(Math.random() * 100);
    }

    missilesRef.current = [...missilesRef.current, ...newMissiles];
  }, []);

  // Créer une explosion au point de tap
  const createExplosion = useCallback((x: number, y: number, timestamp: number) => {
    const exp: Explosion = {
      id: `exp-${Date.now()}-${Math.random()}`,
      x,
      y,
      radius: 0,
      maxRadius: EXPLOSION_MAX_RADIUS,
      phase: "growing",
      opacity: 1,
      phaseStart: timestamp,
    };
    explosionsRef.current = [...explosionsRef.current, exp];
  }, []);

  // Mise à jour missiles
  const updateMissiles = useCallback((delta: number) => {
    const groundY = canvasHRef.current - GROUND_HEIGHT;
    const missiles = missilesRef.current;
    let buildingsChanged = false;

    for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m.destroyed) continue;

      const dx = m.targetX - m.x;
      const dy = m.targetY - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 8) {
        // Missile atteint sa cible — détruire le bâtiment
        m.destroyed = true;
        const buildings = buildingsRef.current;
        for (let j = 0; j < buildings.length; j++) {
          if (buildings[j].alive && Math.abs(buildings[j].x - m.targetX) < 20) {
            buildings[j].alive = false;
            buildingsChanged = true;
            break;
          }
        }
        continue;
      }

      const step = m.speed * delta;
      m.x += (dx / dist) * step;
      m.y += (dy / dist) * step;

      // Sécurité : si le missile est en dessous du sol
      if (m.y >= groundY) {
        m.destroyed = true;
      }
    }

    if (buildingsChanged) {
      setBuildingStates(buildingsRef.current.map((b) => b.alive));
    }
  }, []);

  // Mise à jour explosions
  const updateExplosions = useCallback((delta: number, timestamp: number) => {
    const exps = explosionsRef.current;
    const alive: Explosion[] = [];

    for (let i = 0; i < exps.length; i++) {
      const exp = exps[i];
      if (exp.phase === "growing") {
        exp.radius += EXPLOSION_GROW_SPEED * delta;
        if (exp.radius >= exp.maxRadius) {
          exp.radius = exp.maxRadius;
          exp.phase = "stable";
          exp.phaseStart = timestamp;
        }
        alive.push(exp);
      } else if (exp.phase === "stable") {
        if (timestamp - exp.phaseStart > EXPLOSION_STABLE_DURATION) {
          exp.phase = "fading";
        }
        alive.push(exp);
      } else {
        exp.opacity -= EXPLOSION_FADE_SPEED * delta;
        if (exp.opacity > 0) alive.push(exp);
      }
    }

    explosionsRef.current = alive;
  }, []);

  // Détection collisions missiles/explosions
  const checkCollisions = useCallback(() => {
    const exps = explosionsRef.current;
    const missiles = missilesRef.current;
    const destroyed = new Set<string>();
    const hitsByExplosion = new Map<string, number>();

    for (const exp of exps) {
      if (exp.phase === "fading" && exp.opacity < 0.3) continue;
      for (const m of missiles) {
        if (m.destroyed || destroyed.has(m.id)) continue;
        const dx = m.x - exp.x;
        const dy = m.y - exp.y;
        if (Math.sqrt(dx * dx + dy * dy) <= exp.radius) {
          destroyed.add(m.id);
          hitsByExplosion.set(exp.id, (hitsByExplosion.get(exp.id) ?? 0) + 1);
        }
      }
    }

    if (destroyed.size === 0) return;

    let points = 0;
    let maxCombo = 0;
    hitsByExplosion.forEach((count) => {
      const multiplier = count === 1 ? 1 : count === 2 ? 2 : 3;
      points += 25 * waveRef.current * count * multiplier;
      if (count > maxCombo) maxCombo = count;
    });

    scoreRef.current += points;
    setScore(scoreRef.current);

    for (const m of missiles) {
      if (destroyed.has(m.id)) m.destroyed = true;
    }

    // Feedback combo
    if (maxCombo > 1) {
      // Trouver la position de la dernière explosion avec combo
      let cx = canvasWRef.current / 2;
      let cy = canvasHRef.current / 2;
      for (const exp of exps) {
        if (hitsByExplosion.has(exp.id) && (hitsByExplosion.get(exp.id) ?? 0) > 1) {
          cx = exp.x;
          cy = exp.y - 20;
        }
      }
      comboTextRef.current = {
        text: `×${maxCombo} COMBO!`,
        x: cx,
        y: cy,
        until: performance.now() + 800,
      };
    }
  }, []);

  // Vérifier game over
  const checkGameOver = useCallback(() => {
    const allDead = buildingsRef.current.every((b) => !b.alive);
    if (allDead) {
      gameOverRef.current = true;
      setGameOver(true);
      document.body.style.overflow = "";
      onGameOver(scoreRef.current, waveRef.current);
    }
  }, [onGameOver]);

  // Vérifier fin de vague
  const checkWaveEnd = useCallback((timestamp: number) => {
    if (betweenWavesRef.current) return;

    const elapsed = timestamp - waveStartRef.current;
    const activeMissiles = missilesRef.current.filter((m) => !m.destroyed);

    // Vague terminée si : temps écoulé ET tous les missiles détruits/sortis
    if (elapsed >= WAVE_DURATION && activeMissiles.length === 0) {
      // Bonus bâtiments survivants
      const survivedCount = buildingsRef.current.filter((b) => b.alive).length;
      scoreRef.current += survivedCount * 100;
      setScore(scoreRef.current);

      // Reconstruire un bâtiment si possible
      const deadBuilding = buildingsRef.current.find((b) => !b.alive);
      if (deadBuilding) {
        deadBuilding.alive = true;
        setBuildingStates(buildingsRef.current.map((b) => b.alive));
      }

      // Pause entre les vagues
      betweenWavesRef.current = true;
      setBetweenWaves(true);
      pauseEndRef.current = timestamp + WAVE_PAUSE;
      waveSpawnedRef.current = false;
    }
  }, []);

  // Render
  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvasWRef.current;
    const h = canvasHRef.current;
    const groundY = h - GROUND_HEIGHT;

    // Ciel sombre
    ctx.fillStyle = "#05080F";
    ctx.fillRect(0, 0, w, h);

    // Étoiles
    for (const star of stars) {
      // Adapter les positions au canvas courant
      const sx = (star.x / 430) * w;
      const sy = (star.y / 600) * h;
      ctx.fillStyle = `rgba(255,255,255,${star.opacity})`;
      ctx.fillRect(sx, sy, star.size, star.size);
    }

    // Sol
    ctx.fillStyle = "#1A2A1A";
    ctx.fillRect(0, groundY, w, GROUND_HEIGHT);
    ctx.fillStyle = "#2A3A2A";
    ctx.fillRect(0, groundY, w, 2);

    // Bâtiments
    const buildings = buildingsRef.current;
    for (const b of buildings) {
      if (!b.alive) {
        // Ruines
        ctx.fillStyle = "#2A1A0A";
        ctx.fillRect(b.x - 8, groundY - 6, 16, 6);
        ctx.fillRect(b.x - 4, groundY - 10, 8, 4);
        continue;
      }
      // Bâtiment intact
      ctx.fillStyle = "#3A5A3A";
      ctx.fillRect(b.x - 10, groundY - 24, 20, 24);
      // Toit
      ctx.fillStyle = "#4A6A4A";
      ctx.fillRect(b.x - 10, groundY - 24, 20, 3);
      // Fenêtres
      ctx.fillStyle = "#7CE87C";
      const windows = [
        [b.x - 6, groundY - 20],
        [b.x + 2, groundY - 20],
        [b.x - 6, groundY - 12],
        [b.x + 2, groundY - 12],
      ];
      for (const [wx, wy] of windows) {
        ctx.fillRect(wx, wy, 4, 4);
      }
    }

    // Missiles ennemis
    const missiles = missilesRef.current;
    for (const m of missiles) {
      if (m.destroyed) continue;

      // Traînée
      ctx.strokeStyle = "rgba(232, 124, 124, 0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(m.x, Math.max(0, m.y - 60));
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tête du missile
      ctx.fillStyle = "#E87C7C";
      ctx.beginPath();
      ctx.arc(m.x, m.y, 4, 0, Math.PI * 2);
      ctx.fill();
      // Glow
      ctx.shadowColor = "#E87C7C";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Explosions
    const exps = explosionsRef.current;
    for (const exp of exps) {
      // Cercle principal
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(232, 168, 124, ${exp.opacity * 0.3})`;
      ctx.fill();
      // Anneau
      ctx.strokeStyle = `rgba(240, 200, 160, ${exp.opacity * 0.8})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Centre brillant
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, exp.radius * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 240, 200, ${exp.opacity * 0.6})`;
      ctx.fill();
    }

    // Combo text
    const combo = comboTextRef.current;
    if (combo && timestamp < combo.until) {
      const fade = Math.max(0, (combo.until - timestamp) / 800);
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = `rgba(255, 200, 100, ${fade})`;
      ctx.fillText(combo.text, combo.x, combo.y - (1 - fade) * 20);
    }
  }, [stars]);

  // Game loop
  const gameLoop = useCallback((timestamp: number) => {
    if (gameOverRef.current) return;

    const delta = Math.min(timestamp - lastTimestampRef.current, 32);
    lastTimestampRef.current = timestamp;

    if (betweenWavesRef.current) {
      // Pause entre vagues
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

    // Spawn les missiles si pas encore fait pour cette vague
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

  // Démarrer le jeu
  const startGame = useCallback(() => {
    const w = canvasWRef.current;
    scoreRef.current = 0;
    waveRef.current = 1;
    gameOverRef.current = false;
    betweenWavesRef.current = false;
    waveSpawnedRef.current = false;
    missilesRef.current = [];
    explosionsRef.current = [];
    buildingsRef.current = initBuildings(w);
    comboTextRef.current = null;

    setScore(0);
    setWave(1);
    setGameOver(false);
    setStarted(true);
    setBetweenWaves(false);
    setBuildingStates(Array(BUILDING_COUNT).fill(true));
    startedRef.current = true;

    document.body.style.overflow = "hidden";

    lastTimestampRef.current = performance.now();
    waveStartRef.current = performance.now();

    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [initBuildings, gameLoop]);

  // Gestion tap / click
  const handleTap = useCallback((e: React.TouchEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    if (!startedRef.current || gameOverRef.current || betweenWavesRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    let clientX: number;
    let clientY: number;
    if ("touches" in e) {
      e.preventDefault();
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * (canvasWRef.current / rect.width);
    const y = (clientY - rect.top) * (canvasHRef.current / rect.height);

    createExplosion(x, y, performance.now());
  }, [createExplosion]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Score / Vague / Bâtiments */}
      <div className="flex justify-between items-center w-full px-1" style={{ maxWidth: canvasWidth }}>
        <div className="flex items-center gap-1">
          <span className="text-[10px]" style={{ color: "var(--dim)" }}>Vague</span>
          <span className="text-lg font-bold">{wave}</span>
        </div>
        <span className="text-base font-bold" style={{ color: "var(--accent)" }}>
          {score.toLocaleString("fr-FR")}
        </span>
        <div className="flex gap-1">
          {buildingStates.map((alive, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 12,
                borderRadius: 2,
                background: alive ? "var(--green)" : "var(--dim)",
                opacity: alive ? 1 : 0.3,
              }}
            />
          ))}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="rounded-xl"
        onTouchStart={handleTap}
        onClick={handleTap}
        style={{
          background: "#05080F",
          border: "1px solid var(--glass-border)",
          touchAction: "none",
          display: "block",
          width: canvasWidth,
          height: canvasHeight,
        }}
      />

      {betweenWaves && (
        <div className="text-center py-2">
          <p className="text-sm font-bold">Vague {wave} terminée !</p>
          <p className="text-xs" style={{ color: "var(--dim)" }}>
            Prochaine vague dans {countdown}s
          </p>
        </div>
      )}

      {!started && !gameOver && (
        <button
          className="px-6 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={startGame}
        >
          ▶ Défendre la ville
        </button>
      )}

      {gameOver && (
        <div className="text-center">
          <p className="text-lg font-bold mb-1">Ville détruite</p>
          <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
            {score.toLocaleString("fr-FR")} pts
          </p>
          <p className="text-xs mb-3" style={{ color: "var(--dim)" }}>
            {wave} vague{wave > 1 ? "s" : ""} survivée{wave > 1 ? "s" : ""}
          </p>
          <button
            className="px-6 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform"
            style={{ background: "var(--accent)", color: "#fff" }}
            onClick={startGame}
          >
            Rejouer
          </button>
        </div>
      )}
    </div>
  );
}
