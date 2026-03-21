"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface BreakoutGameProps {
  onGameOver: (score: number, level: number) => void;
}

// Constantes de jeu
const PADDLE_HEIGHT = 14;
const PADDLE_RADIUS = 8;
const BALL_RADIUS = 7;
const BRICK_ROWS = 5;
const BRICK_COLS = 8;
const BRICK_PADDING = 4;
const BRICK_TOP_OFFSET = 8;
const BRICK_HEIGHT = 16;
const INITIAL_LIVES = 3;
const BASE_SPEED = 4;

// Couleurs des rangées de briques (via CSS vars, fallback hex)
const ROW_CSS_VARS = ["--red", "--warm", "--green", "--teal", "--accent"];

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
  color: string;
  hits: number; // briques solides au niveau 3+
}

export default function BreakoutGame({ onGameOver }: BreakoutGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(INITIAL_LIVES);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(360);
  const [canvasHeight, setCanvasHeight] = useState(500);

  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const livesRef = useRef(INITIAL_LIVES);
  const gameOverRef = useRef(false);
  const startedRef = useRef(false);
  const animFrameRef = useRef(0);
  const canvasWRef = useRef(360);
  const canvasHRef = useRef(500);

  // Paddle
  const paddleXRef = useRef(0);
  const paddleWRef = useRef(80);

  // Balle
  const ballXRef = useRef(0);
  const ballYRef = useRef(0);
  const ballDXRef = useRef(0);
  const ballDYRef = useRef(0);
  const ballSpeedRef = useRef(BASE_SPEED);
  const ballLaunchedRef = useRef(false);

  // Briques
  const bricksRef = useRef<Brick[]>([]);

  // Couleurs résolues
  const colorsRef = useRef<string[]>([]);

  // Touch/mouse tracking
  const pointerXRef = useRef<number | null>(null);

  // Résoudre les couleurs CSS
  const resolveColors = useCallback(() => {
    const el = document.documentElement;
    const style = getComputedStyle(el);
    colorsRef.current = ROW_CSS_VARS.map((v) => {
      const val = style.getPropertyValue(v).trim();
      return val || "#7C6BF0";
    });
  }, []);

  // Générer les briques pour un niveau
  const generateBricks = useCallback((lvl: number) => {
    const w = canvasWRef.current;
    const brickW = (w - (BRICK_COLS + 1) * BRICK_PADDING) / BRICK_COLS;
    const rows = Math.min(BRICK_ROWS + Math.floor((lvl - 1) / 2), 8);
    const bricks: Brick[] = [];
    const colors = colorsRef.current;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const x = BRICK_PADDING + c * (brickW + BRICK_PADDING);
        const y = BRICK_TOP_OFFSET + r * (BRICK_HEIGHT + BRICK_PADDING);
        const colorIdx = r % colors.length;
        const hits = lvl >= 3 && r < 2 ? 2 : 1; // briques solides en haut à partir du niveau 3
        bricks.push({
          x,
          y,
          w: brickW,
          h: BRICK_HEIGHT,
          alive: true,
          color: colors[colorIdx],
          hits,
        });
      }
    }
    bricksRef.current = bricks;
  }, []);

  // Reset balle sur la raquette
  const resetBall = useCallback(() => {
    const w = canvasWRef.current;
    const h = canvasHRef.current;
    paddleXRef.current = (w - paddleWRef.current) / 2;
    ballXRef.current = w / 2;
    ballYRef.current = h - PADDLE_HEIGHT - 20 - BALL_RADIUS;
    ballDXRef.current = 0;
    ballDYRef.current = 0;
    ballLaunchedRef.current = false;
  }, []);

  // Lancer la balle
  const launchBall = useCallback(() => {
    if (ballLaunchedRef.current) return;
    ballLaunchedRef.current = true;
    const speed = ballSpeedRef.current;
    const angle = -Math.PI / 4 + Math.random() * Math.PI / 2; // entre -45° et 45°
    ballDXRef.current = speed * Math.sin(angle);
    ballDYRef.current = -speed * Math.cos(angle);
  }, []);

  // Taille dynamique du canvas
  useEffect(() => {
    const resize = () => {
      const maxW = Math.min(window.innerWidth - 32, 430);
      const maxH = Math.min(window.innerHeight - 260, 560);
      const w = Math.max(280, maxW);
      const h = Math.max(400, maxH);
      setCanvasWidth(w);
      setCanvasHeight(h);
      canvasWRef.current = w;
      canvasHRef.current = h;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Redimensionner le canvas quand la taille change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }, [canvasWidth, canvasHeight]);

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvasWRef.current;
    const h = canvasHRef.current;

    // Fond
    ctx.fillStyle = "#0F1117";
    ctx.fillRect(0, 0, w, h);

    // Briques
    for (const brick of bricksRef.current) {
      if (!brick.alive) continue;
      ctx.fillStyle = brick.color;
      if (brick.hits > 1) {
        // Brique solide — plus opaque avec bordure
        ctx.globalAlpha = 1;
        ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(brick.x + 1, brick.y + 1, brick.w - 2, brick.h - 2);
      } else {
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.roundRect(brick.x, brick.y, brick.w, brick.h, 3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Raquette
    const px = paddleXRef.current;
    const pw = paddleWRef.current;
    const py = h - PADDLE_HEIGHT - 16;
    ctx.fillStyle = "#ECEEF4";
    ctx.beginPath();
    ctx.roundRect(px, py, pw, PADDLE_HEIGHT, PADDLE_RADIUS);
    ctx.fill();

    // Balle
    const bx = ballXRef.current;
    const by = ballYRef.current;
    ctx.fillStyle = "#ECEEF4";
    ctx.beginPath();
    ctx.arc(bx, by, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    // Glow accent
    ctx.shadowColor = colorsRef.current[4] || "#7C6BF0";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(bx, by, BALL_RADIUS - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, []);

  // Update logique de jeu
  const update = useCallback(() => {
    if (gameOverRef.current) return;
    if (!ballLaunchedRef.current) {
      // Balle suit la raquette
      ballXRef.current = paddleXRef.current + paddleWRef.current / 2;
      ballYRef.current = canvasHRef.current - PADDLE_HEIGHT - 16 - BALL_RADIUS;
      return;
    }

    const w = canvasWRef.current;
    const h = canvasHRef.current;
    let bx = ballXRef.current + ballDXRef.current;
    let by = ballYRef.current + ballDYRef.current;
    let dx = ballDXRef.current;
    let dy = ballDYRef.current;

    // Rebond murs gauche/droite
    if (bx - BALL_RADIUS <= 0) {
      bx = BALL_RADIUS;
      dx = Math.abs(dx);
    } else if (bx + BALL_RADIUS >= w) {
      bx = w - BALL_RADIUS;
      dx = -Math.abs(dx);
    }

    // Rebond plafond
    if (by - BALL_RADIUS <= 0) {
      by = BALL_RADIUS;
      dy = Math.abs(dy);
    }

    // Collision raquette
    const px = paddleXRef.current;
    const pw = paddleWRef.current;
    const py = h - PADDLE_HEIGHT - 16;
    if (
      dy > 0 &&
      by + BALL_RADIUS >= py &&
      by + BALL_RADIUS <= py + PADDLE_HEIGHT + 4 &&
      bx >= px - 2 &&
      bx <= px + pw + 2
    ) {
      // Angle de rebond basé sur la position relative sur la raquette
      const hitPos = (bx - px) / pw; // 0..1
      const angle = (hitPos - 0.5) * Math.PI * 0.7; // -63° à +63°
      const speed = ballSpeedRef.current;
      dx = speed * Math.sin(angle);
      dy = -speed * Math.cos(angle);
      by = py - BALL_RADIUS;
    }

    // Balle perdue (en bas)
    if (by + BALL_RADIUS > h) {
      livesRef.current--;
      setLives(livesRef.current);
      if (livesRef.current <= 0) {
        gameOverRef.current = true;
        setGameOver(true);
        onGameOver(scoreRef.current, levelRef.current);
        return;
      }
      resetBall();
      return;
    }

    // Collision briques
    let hitBrick = false;
    for (const brick of bricksRef.current) {
      if (!brick.alive) continue;
      // Test AABB balle vs brique
      const closestX = Math.max(brick.x, Math.min(bx, brick.x + brick.w));
      const closestY = Math.max(brick.y, Math.min(by, brick.y + brick.h));
      const distX = bx - closestX;
      const distY = by - closestY;
      if (distX * distX + distY * distY <= BALL_RADIUS * BALL_RADIUS) {
        brick.hits--;
        if (brick.hits <= 0) {
          brick.alive = false;
          scoreRef.current += 10 * levelRef.current;
          setScore(scoreRef.current);
        } else {
          scoreRef.current += 5 * levelRef.current;
          setScore(scoreRef.current);
        }
        // Déterminer le côté de collision
        const overlapLeft = bx + BALL_RADIUS - brick.x;
        const overlapRight = brick.x + brick.w - (bx - BALL_RADIUS);
        const overlapTop = by + BALL_RADIUS - brick.y;
        const overlapBottom = brick.y + brick.h - (by - BALL_RADIUS);
        const minOverlapX = Math.min(overlapLeft, overlapRight);
        const minOverlapY = Math.min(overlapTop, overlapBottom);
        if (minOverlapX < minOverlapY) {
          dx = -dx;
        } else {
          dy = -dy;
        }
        hitBrick = true;
        break; // une seule collision par frame
      }
    }

    ballXRef.current = bx;
    ballYRef.current = by;
    ballDXRef.current = dx;
    ballDYRef.current = dy;

    // Vérifier si toutes les briques sont cassées → niveau suivant
    if (!hitBrick) return;
    const allDestroyed = bricksRef.current.every((b) => !b.alive);
    if (allDestroyed) {
      levelRef.current++;
      setLevel(levelRef.current);
      ballSpeedRef.current = BASE_SPEED + (levelRef.current - 1) * 0.5;
      // Réduire la taille de la raquette à chaque niveau (min 50px)
      paddleWRef.current = Math.max(50, 80 - (levelRef.current - 1) * 5);
      resolveColors();
      generateBricks(levelRef.current);
      resetBall();
    }
  }, [onGameOver, resetBall, resolveColors, generateBricks]);

  // Game loop
  const gameLoop = useCallback((timestamp: number) => {
    if (gameOverRef.current) return;
    update();
    render();
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [update, render]);

  // Démarrer le jeu
  const startGame = useCallback(() => {
    resolveColors();
    scoreRef.current = 0;
    levelRef.current = 1;
    livesRef.current = INITIAL_LIVES;
    gameOverRef.current = false;
    ballSpeedRef.current = BASE_SPEED;
    paddleWRef.current = 80;
    setScore(0);
    setLevel(1);
    setLives(INITIAL_LIVES);
    setGameOver(false);
    setStarted(true);
    startedRef.current = true;

    generateBricks(1);
    resetBall();

    // Bloquer le scroll
    document.body.style.overflow = "hidden";

    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [resolveColors, generateBricks, resetBall, gameLoop]);

  // Déplacer la raquette (pointer/touch/mouse)
  const handlePointerMove = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !startedRef.current || gameOverRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const pw = paddleWRef.current;
    const w = canvasWRef.current;
    paddleXRef.current = Math.max(0, Math.min(x - pw / 2, w - pw));
  }, []);

  // Lancer la balle au tap/click
  const handleTap = useCallback(() => {
    if (!startedRef.current || gameOverRef.current) return;
    if (!ballLaunchedRef.current) {
      launchBall();
    }
  }, [launchBall]);

  // Events touch
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX);
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX);
        handleTap();
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX);
    };
    const onClick = () => {
      handleTap();
    };

    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("click", onClick);

    return () => {
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("click", onClick);
    };
  }, [handlePointerMove, handleTap]);

  // Keyboard (flèches + espace)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!startedRef.current || gameOverRef.current) return;
      const step = 30;
      const w = canvasWRef.current;
      const pw = paddleWRef.current;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        paddleXRef.current = Math.max(0, paddleXRef.current - step);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        paddleXRef.current = Math.min(w - pw, paddleXRef.current + step);
      } else if (e.code === "Space") {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleTap]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Score / Niveau / Vies */}
      <div className="flex justify-between w-full px-1" style={{ maxWidth: canvasWidth }}>
        <span className="text-xs font-bold" style={{ color: "var(--dim)" }}>
          Niv: {level}
        </span>
        <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
          {score} pts
        </span>
        <span className="text-xs">
          {"❤️".repeat(lives)}{"🖤".repeat(Math.max(0, INITIAL_LIVES - lives))}
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="rounded-xl"
        style={{
          background: "#0F1117",
          border: "1px solid var(--glass-border)",
          touchAction: "none",
          display: "block",
          width: canvasWidth,
          height: canvasHeight,
        }}
      />

      {!started && !gameOver && (
        <button
          className="px-6 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={startGame}
        >
          ▶ Jouer
        </button>
      )}

      {started && !gameOver && !ballLaunchedRef.current && (
        <p className="text-[10px]" style={{ color: "var(--dim)" }}>
          Touche le canvas ou appuie sur Espace pour lancer
        </p>
      )}

      {gameOver && (
        <div className="text-center">
          <p className="text-lg font-bold mb-1">Game Over</p>
          <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{score} pts</p>
          <p className="text-xs mb-3" style={{ color: "var(--dim)" }}>Niveau {level}</p>
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
