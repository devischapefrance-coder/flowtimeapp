"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface FlappyGameProps {
  onGameOver: (score: number) => void;
  avatarUrl: string | null;
  emoji: string;
}

const GRAVITY = 0.4;
const JUMP = -7;
const PIPE_WIDTH = 50;
const PIPE_GAP = 140;
const PIPE_SPEED = 2.5;
const BIRD_RADIUS = 18;

interface Pipe {
  x: number;
  topH: number;
  scored: boolean;
}

export default function FlappyGame({ onGameOver, avatarUrl, emoji }: FlappyGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);

  const birdYRef = useRef(200);
  const birdVelRef = useRef(0);
  const pipesRef = useRef<Pipe[]>([]);
  const scoreRef = useRef(0);
  const gameOverRef = useRef(false);
  const animFrameRef = useRef(0);
  const frameCountRef = useRef(0);
  const avatarImgRef = useRef<HTMLImageElement | null>(null);
  const avatarLoadedRef = useRef(false);
  const canvasWRef = useRef(380);
  const canvasHRef = useRef(500);

  // Charger l'avatar
  useEffect(() => {
    if (!avatarUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = avatarUrl;
    img.onload = () => {
      avatarImgRef.current = img;
      avatarLoadedRef.current = true;
    };
  }, [avatarUrl]);

  const spawnPipe = useCallback(() => {
    const minTop = 60;
    const maxTop = canvasHRef.current - PIPE_GAP - 60;
    const topH = Math.floor(Math.random() * (maxTop - minTop)) + minTop;
    pipesRef.current.push({ x: canvasWRef.current, topH, scored: false });
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    // Background gradient
    ctx.fillStyle = "#0F1117";
    ctx.fillRect(0, 0, w, h);

    // Sol
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(0, h - 40, w, 40);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.moveTo(0, h - 40);
    ctx.lineTo(w, h - 40);
    ctx.stroke();

    // Tuyaux
    ctx.fillStyle = "#5EC89E";
    for (const pipe of pipesRef.current) {
      // Tuyau haut
      ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topH);
      ctx.fillRect(pipe.x - 4, pipe.topH - 20, PIPE_WIDTH + 8, 20);
      // Tuyau bas
      const bottomY = pipe.topH + PIPE_GAP;
      ctx.fillRect(pipe.x, bottomY, PIPE_WIDTH, h - bottomY);
      ctx.fillRect(pipe.x - 4, bottomY, PIPE_WIDTH + 8, 20);
    }

    // Oiseau (avatar ou emoji)
    const birdX = 80;
    const birdY = birdYRef.current;
    ctx.save();
    ctx.beginPath();
    ctx.arc(birdX, birdY, BIRD_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    if (avatarLoadedRef.current && avatarImgRef.current) {
      ctx.drawImage(avatarImgRef.current, birdX - BIRD_RADIUS, birdY - BIRD_RADIUS, BIRD_RADIUS * 2, BIRD_RADIUS * 2);
    } else {
      ctx.fillStyle = "#7C6BF0";
      ctx.fill();
    }
    ctx.restore();
    // Bordure
    ctx.strokeStyle = "#7C6BF0";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(birdX, birdY, BIRD_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Emoji fallback si pas d'avatar
    if (!avatarLoadedRef.current) {
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji || "🐤", birdX, birdY);
    }

    // Score
    ctx.fillStyle = "#ECEEF4";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(scoreRef.current), w / 2, 50);
  }, [emoji]);

  const update = useCallback(() => {
    // Gravité
    birdVelRef.current += GRAVITY;
    birdYRef.current += birdVelRef.current;

    const h = canvasHRef.current;
    const birdX = 80;
    const birdY = birdYRef.current;

    // Sol / plafond
    if (birdY + BIRD_RADIUS > h - 40 || birdY - BIRD_RADIUS < 0) {
      gameOverRef.current = true;
      setGameOver(true);
      onGameOver(scoreRef.current);
      return;
    }

    // Tuyaux
    frameCountRef.current++;
    if (frameCountRef.current % 90 === 0) {
      spawnPipe();
    }

    pipesRef.current = pipesRef.current.filter((p) => p.x + PIPE_WIDTH > -10);

    for (const pipe of pipesRef.current) {
      pipe.x -= PIPE_SPEED;

      // Score
      if (!pipe.scored && pipe.x + PIPE_WIDTH < birdX) {
        pipe.scored = true;
        scoreRef.current++;
        setScore(scoreRef.current);
      }

      // Collision
      if (
        birdX + BIRD_RADIUS > pipe.x &&
        birdX - BIRD_RADIUS < pipe.x + PIPE_WIDTH
      ) {
        if (birdY - BIRD_RADIUS < pipe.topH || birdY + BIRD_RADIUS > pipe.topH + PIPE_GAP) {
          gameOverRef.current = true;
          setGameOver(true);
          onGameOver(scoreRef.current);
          return;
        }
      }
    }
  }, [onGameOver, spawnPipe]);

  const gameLoop = useCallback(() => {
    if (gameOverRef.current) return;
    update();
    render();
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [update, render]);

  const jump = useCallback(() => {
    if (gameOverRef.current) return;
    birdVelRef.current = JUMP;
  }, []);

  const startGame = useCallback(() => {
    birdYRef.current = 200;
    birdVelRef.current = 0;
    pipesRef.current = [];
    scoreRef.current = 0;
    frameCountRef.current = 0;
    gameOverRef.current = false;
    setScore(0);
    setGameOver(false);
    setStarted(true);
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = Math.min(parent.clientWidth, 400);
    const h = Math.min(window.innerHeight - 200, 500);
    canvas.width = w;
    canvas.height = h;
    canvasWRef.current = w;
    canvasHRef.current = h;
    render();
  }, [render]);

  // Tap / click / space
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        jump();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [jump]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function handleTouch(e: TouchEvent) {
      e.preventDefault();
      jump();
    }
    function handleClick() {
      jump();
    }
    canvas.addEventListener("touchstart", handleTouch, { passive: false });
    canvas.addEventListener("click", handleClick);
    return () => {
      canvas.removeEventListener("touchstart", handleTouch);
      canvas.removeEventListener("click", handleClick);
    };
  }, [jump]);

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <canvas
        ref={canvasRef}
        className="rounded-2xl"
        style={{ background: "#0F1117", border: "1px solid var(--glass-border)", touchAction: "none" }}
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
      {gameOver && (
        <div className="text-center">
          <p className="text-lg font-bold mb-1">Game Over</p>
          <p className="text-2xl font-bold mb-3" style={{ color: "var(--accent)" }}>{score} pts</p>
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
