"use client";

import { useRef, useEffect, useState, useCallback } from "react";

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
type Point = { x: number; y: number };

interface SnakeGameProps {
  onGameOver: (score: number) => void;
}

const GRID = 20;
const BASE_SPEED = 150;
const SPEED_DECREASE = 5;
const MIN_SPEED = 60;

export default function SnakeGame({ onGameOver }: SnakeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);

  const snakeRef = useRef<Point[]>([{ x: 10, y: 10 }]);
  const dirRef = useRef<Direction>("RIGHT");
  const nextDirRef = useRef<Direction>("RIGHT");
  const appleRef = useRef<Point>({ x: 15, y: 10 });
  const scoreRef = useRef(0);
  const gameOverRef = useRef(false);
  const animFrameRef = useRef(0);
  const lastTimeRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const spawnApple = useCallback(() => {
    const snake = snakeRef.current;
    let apple: Point;
    do {
      apple = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (snake.some((s) => s.x === apple.x && s.y === apple.y));
    appleRef.current = apple;
  }, []);

  const getSpeed = useCallback(() => {
    return Math.max(MIN_SPEED, BASE_SPEED - Math.floor(scoreRef.current / 50) * SPEED_DECREASE);
  }, []);

  const getCellSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return 20;
    return canvas.width / GRID;
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cell = getCellSize();

    // Background
    ctx.fillStyle = "#0F1117";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grille subtile
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, canvas.height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(canvas.width, i * cell);
      ctx.stroke();
    }

    // Pomme
    const apple = appleRef.current;
    ctx.fillStyle = "#F06B7E";
    ctx.beginPath();
    ctx.arc(apple.x * cell + cell / 2, apple.y * cell + cell / 2, cell * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Snake
    const snake = snakeRef.current;
    snake.forEach((seg, i) => {
      const isHead = i === 0;
      ctx.fillStyle = isHead ? "#9B8BFF" : "#7C6BF0";
      const r = cell * 0.1;
      const x = seg.x * cell + 1;
      const y = seg.y * cell + 1;
      const w = cell - 2;
      const h = cell - 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
    });

    // Score
    ctx.fillStyle = "rgba(236,238,244,0.5)";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Score: ${scoreRef.current}`, 8, 18);
  }, [getCellSize]);

  const update = useCallback(() => {
    const snake = snakeRef.current;
    const dir = nextDirRef.current;
    dirRef.current = dir;

    const head = { ...snake[0] };
    if (dir === "UP") head.y--;
    else if (dir === "DOWN") head.y++;
    else if (dir === "LEFT") head.x--;
    else if (dir === "RIGHT") head.x++;

    // Collision murs
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
      gameOverRef.current = true;
      setGameOver(true);
      onGameOver(scoreRef.current);
      return;
    }

    // Collision soi-même
    if (snake.some((s) => s.x === head.x && s.y === head.y)) {
      gameOverRef.current = true;
      setGameOver(true);
      onGameOver(scoreRef.current);
      return;
    }

    snake.unshift(head);

    // Manger la pomme
    const apple = appleRef.current;
    if (head.x === apple.x && head.y === apple.y) {
      scoreRef.current += 10;
      setScore(scoreRef.current);
      spawnApple();
    } else {
      snake.pop();
    }
  }, [onGameOver, spawnApple]);

  const gameLoop = useCallback((timestamp: number) => {
    if (gameOverRef.current) return;
    if (timestamp - lastTimeRef.current >= getSpeed()) {
      lastTimeRef.current = timestamp;
      update();
    }
    render();
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [update, render, getSpeed]);

  const startGame = useCallback(() => {
    snakeRef.current = [{ x: 10, y: 10 }];
    dirRef.current = "RIGHT";
    nextDirRef.current = "RIGHT";
    scoreRef.current = 0;
    gameOverRef.current = false;
    setScore(0);
    setGameOver(false);
    setStarted(true);
    spawnApple();
    lastTimeRef.current = 0;
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [spawnApple, gameLoop]);

  // Resize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const size = Math.min(parent.clientWidth, 400);
    canvas.width = size;
    canvas.height = size;
    render();
  }, [render]);

  // Keyboard controls
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const dir = dirRef.current;
      if (e.key === "ArrowUp" && dir !== "DOWN") nextDirRef.current = "UP";
      else if (e.key === "ArrowDown" && dir !== "UP") nextDirRef.current = "DOWN";
      else if (e.key === "ArrowLeft" && dir !== "RIGHT") nextDirRef.current = "LEFT";
      else if (e.key === "ArrowRight" && dir !== "LEFT") nextDirRef.current = "RIGHT";
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // Touch controls
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onTouchStart(e: TouchEvent) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      e.preventDefault();
    }

    function onTouchEnd(e: TouchEvent) {
      if (!touchStartRef.current) return;
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 20) return;
      const dir = dirRef.current;
      if (absDx > absDy) {
        if (dx > 0 && dir !== "LEFT") nextDirRef.current = "RIGHT";
        else if (dx < 0 && dir !== "RIGHT") nextDirRef.current = "LEFT";
      } else {
        if (dy > 0 && dir !== "UP") nextDirRef.current = "DOWN";
        else if (dy < 0 && dir !== "DOWN") nextDirRef.current = "UP";
      }
      e.preventDefault();
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
    }

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

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
