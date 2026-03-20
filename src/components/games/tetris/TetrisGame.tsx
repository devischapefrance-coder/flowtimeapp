"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface TetrisGameProps {
  onGameOver: (score: number, level: number, lines: number) => void;
}

const COLS = 10;
const ROWS = 20;
const BASE_SPEED = 800;
const PREVIEW_WIDTH = 72;

type Board = number[][];
type Piece = { shape: number[][]; color: string; x: number; y: number };

const PIECES: { shape: number[][]; color: string }[] = [
  { shape: [[1, 1, 1, 1]], color: "#5ED4C8" },
  { shape: [[1, 1], [1, 1]], color: "#F5C563" },
  { shape: [[0, 1, 0], [1, 1, 1]], color: "#7C6BF0" },
  { shape: [[0, 1, 1], [1, 1, 0]], color: "#5EC89E" },
  { shape: [[1, 1, 0], [0, 1, 1]], color: "#F06B7E" },
  { shape: [[1, 0, 0], [1, 1, 1]], color: "#6BA3F0" },
  { shape: [[0, 0, 1], [1, 1, 1]], color: "#B39DDB" },
];

const PIECE_COLORS = ["", "#5ED4C8", "#F5C563", "#7C6BF0", "#5EC89E", "#F06B7E", "#6BA3F0", "#B39DDB"];

function createBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomPiece(): Piece {
  const idx = Math.floor(Math.random() * PIECES.length);
  const p = PIECES[idx];
  return { shape: p.shape.map((r) => [...r]), color: p.color, x: Math.floor(COLS / 2) - 1, y: 0 };
}

function rotate(shape: number[][]): number[][] {
  const rows = shape.length;
  const cols = shape[0].length;
  const rotated: number[][] = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rotated[c][rows - 1 - r] = shape[r][c];
    }
  }
  return rotated;
}

function collides(board: Board, piece: Piece): boolean {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const nx = piece.x + c;
      const ny = piece.y + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function merge(board: Board, piece: Piece, colorIdx: number): Board {
  const newBoard = board.map((r) => [...r]);
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue;
      const ny = piece.y + r;
      const nx = piece.x + c;
      if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
        newBoard[ny][nx] = colorIdx;
      }
    }
  }
  return newBoard;
}

function clearLines(board: Board): { board: Board; cleared: number } {
  const newBoard = board.filter((row) => row.some((cell) => cell === 0));
  const cleared = ROWS - newBoard.length;
  while (newBoard.length < ROWS) {
    newBoard.unshift(Array(COLS).fill(0));
  }
  return { board: newBoard, cleared };
}

export default function TetrisGame({ onGameOver }: TetrisGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lines, setLines] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [cellSize, setCellSize] = useState(20);
  const [nextPieceDisplay, setNextPieceDisplay] = useState<{ shape: number[][]; color: string } | null>(null);

  const boardRef = useRef<Board>(createBoard());
  const pieceRef = useRef<Piece>(randomPiece());
  const nextPieceRef = useRef<Piece>(randomPiece());
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const linesRef = useRef(0);
  const gameOverRef = useRef(false);
  const animFrameRef = useRef(0);
  const lastDropRef = useRef(0);
  const cellSizeRef = useRef(20);

  const getColorIdx = useCallback((piece: Piece): number => {
    return PIECES.findIndex((p) => p.color === piece.color) + 1;
  }, []);

  const getSpeed = useCallback(() => {
    return Math.max(100, BASE_SPEED - (levelRef.current - 1) * 70);
  }, []);

  // Calcul dynamique de la taille des cellules
  useEffect(() => {
    const resize = () => {
      const availableW = window.innerWidth - 32 - PREVIEW_WIDTH - 8;
      const maxByWidth = Math.floor(availableW / COLS);
      const availableH = window.innerHeight - 280;
      const maxByHeight = Math.floor(availableH / ROWS);
      const size = Math.max(12, Math.min(maxByWidth, maxByHeight));
      setCellSize(size);
      cellSizeRef.current = size;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Redimensionner le canvas quand cellSize change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = COLS * cellSize;
    canvas.height = ROWS * cellSize;
  }, [cellSize]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cell = cellSizeRef.current;

    ctx.fillStyle = "#0F1117";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grille
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * cell);
      ctx.lineTo(COLS * cell, r * cell);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * cell, 0);
      ctx.lineTo(c * cell, ROWS * cell);
      ctx.stroke();
    }

    // Cellules du board
    const board = boardRef.current;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          ctx.fillStyle = PIECE_COLORS[board[r][c]] || "#7C6BF0";
          ctx.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
        }
      }
    }

    // Piece active
    const piece = pieceRef.current;
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (!piece.shape[r][c]) continue;
        ctx.fillStyle = piece.color;
        ctx.fillRect((piece.x + c) * cell + 1, (piece.y + r) * cell + 1, cell - 2, cell - 2);
      }
    }

    // Ombre (ghost piece)
    let ghostY = piece.y;
    while (!collides(board, { ...piece, y: ghostY + 1 })) ghostY++;
    if (ghostY !== piece.y) {
      ctx.globalAlpha = 0.2;
      for (let r = 0; r < piece.shape.length; r++) {
        for (let c = 0; c < piece.shape[r].length; c++) {
          if (!piece.shape[r][c]) continue;
          ctx.fillStyle = piece.color;
          ctx.fillRect((piece.x + c) * cell + 1, (ghostY + r) * cell + 1, cell - 2, cell - 2);
        }
      }
      ctx.globalAlpha = 1;
    }
  }, []);

  const placePiece = useCallback(() => {
    const board = boardRef.current;
    const piece = pieceRef.current;
    const colorIdx = getColorIdx(piece);
    const merged = merge(board, piece, colorIdx);
    const { board: cleared, cleared: numCleared } = clearLines(merged);
    boardRef.current = cleared;

    if (numCleared > 0) {
      const pts = [0, 100, 300, 500, 800][numCleared] * levelRef.current;
      scoreRef.current += pts;
      linesRef.current += numCleared;
      setScore(scoreRef.current);
      setLines(linesRef.current);

      const newLevel = Math.floor(linesRef.current / 10) + 1;
      if (newLevel !== levelRef.current) {
        levelRef.current = newLevel;
        setLevel(newLevel);
      }
    }

    pieceRef.current = nextPieceRef.current;
    nextPieceRef.current = randomPiece();
    setNextPieceDisplay({ shape: nextPieceRef.current.shape.map((r) => [...r]), color: nextPieceRef.current.color });

    if (collides(boardRef.current, pieceRef.current)) {
      gameOverRef.current = true;
      setGameOver(true);
      onGameOver(scoreRef.current, levelRef.current, linesRef.current);
    }
  }, [getColorIdx, onGameOver]);

  const moveDown = useCallback(() => {
    const piece = pieceRef.current;
    const test = { ...piece, y: piece.y + 1 };
    if (collides(boardRef.current, test)) {
      placePiece();
    } else {
      pieceRef.current = test;
    }
  }, [placePiece]);

  const moveLeft = useCallback(() => {
    const piece = pieceRef.current;
    const test = { ...piece, x: piece.x - 1 };
    if (!collides(boardRef.current, test)) pieceRef.current = test;
  }, []);

  const moveRight = useCallback(() => {
    const piece = pieceRef.current;
    const test = { ...piece, x: piece.x + 1 };
    if (!collides(boardRef.current, test)) pieceRef.current = test;
  }, []);

  const rotatePiece = useCallback(() => {
    const piece = pieceRef.current;
    const rotated = rotate(piece.shape);
    const test = { ...piece, shape: rotated };
    if (!collides(boardRef.current, test)) {
      pieceRef.current = test;
    } else if (!collides(boardRef.current, { ...test, x: test.x - 1 })) {
      pieceRef.current = { ...test, x: test.x - 1 };
    } else if (!collides(boardRef.current, { ...test, x: test.x + 1 })) {
      pieceRef.current = { ...test, x: test.x + 1 };
    }
  }, []);

  const hardDrop = useCallback(() => {
    const piece = pieceRef.current;
    let test = { ...piece };
    while (!collides(boardRef.current, { ...test, y: test.y + 1 })) {
      test = { ...test, y: test.y + 1 };
    }
    pieceRef.current = test;
    placePiece();
  }, [placePiece]);

  const gameLoop = useCallback((timestamp: number) => {
    if (gameOverRef.current) return;
    if (timestamp - lastDropRef.current >= getSpeed()) {
      lastDropRef.current = timestamp;
      moveDown();
    }
    render();
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [moveDown, render, getSpeed]);

  const startGame = useCallback(() => {
    boardRef.current = createBoard();
    pieceRef.current = randomPiece();
    nextPieceRef.current = randomPiece();
    scoreRef.current = 0;
    levelRef.current = 1;
    linesRef.current = 0;
    gameOverRef.current = false;
    lastDropRef.current = 0;
    setScore(0);
    setLevel(1);
    setLines(0);
    setGameOver(false);
    setStarted(true);
    setNextPieceDisplay({ shape: nextPieceRef.current.shape.map((r) => [...r]), color: nextPieceRef.current.color });
    animFrameRef.current = requestAnimationFrame(gameLoop);
  }, [gameLoop]);

  // Keyboard
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (gameOverRef.current || !started) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); moveLeft(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); moveRight(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveDown(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); rotatePiece(); }
      else if (e.code === "Space") { e.preventDefault(); hardDrop(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [started, moveLeft, moveRight, moveDown, rotatePiece, hardDrop]);

  // Cleanup
  useEffect(() => {
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const boardWidth = COLS * cellSize;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Score / Niveau / Lignes */}
      <div
        className="flex justify-between w-full px-1"
        style={{ maxWidth: boardWidth + PREVIEW_WIDTH + 8 }}
      >
        <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
          Score: {score}
        </span>
        <span className="text-xs font-bold" style={{ color: "var(--dim)" }}>
          Niv: {level}
        </span>
        <span className="text-xs font-bold" style={{ color: "var(--dim)" }}>
          Lignes: {lines}
        </span>
      </div>

      {/* Board + Preview cote a cote */}
      <div className="flex gap-2 items-start">
        <canvas
          ref={canvasRef}
          className="rounded-xl"
          style={{
            background: "#0F1117",
            border: "1px solid var(--glass-border)",
            touchAction: "none",
            width: boardWidth,
            height: ROWS * cellSize,
          }}
        />

        {/* Panneau piece suivante */}
        <div
          className="rounded-xl flex flex-col items-center gap-1 pt-2 pb-3 shrink-0"
          style={{ background: "var(--surface)", width: PREVIEW_WIDTH, border: "1px solid var(--glass-border)" }}
        >
          <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--dim)" }}>
            Suivant
          </p>
          <div className="flex flex-col items-center justify-center mt-1">
            {nextPieceDisplay ? (
              nextPieceDisplay.shape.map((row, ri) => (
                <div key={ri} className="flex">
                  {row.map((cell, ci) => (
                    <div
                      key={ci}
                      style={{
                        width: 14,
                        height: 14,
                        margin: 1,
                        borderRadius: 2,
                        background: cell ? nextPieceDisplay.color : "transparent",
                      }}
                    />
                  ))}
                </div>
              ))
            ) : (
              <div style={{ width: 48, height: 32 }} />
            )}
          </div>
        </div>
      </div>

      {/* Boutons tactiles */}
      {started && !gameOver && (
        <div className="grid grid-cols-5 gap-2 w-full" style={{ maxWidth: boardWidth + PREVIEW_WIDTH + 8 }}>
          <button
            className="h-12 rounded-xl flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
            style={{ background: "var(--surface2)", color: "var(--text)" }}
            onClick={moveLeft}
          >
            ←
          </button>
          <button
            className="h-12 rounded-xl flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
            style={{ background: "var(--surface2)", color: "var(--text)" }}
            onClick={moveDown}
          >
            ↓
          </button>
          <button
            className="h-12 rounded-xl flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            onClick={rotatePiece}
          >
            ↻
          </button>
          <button
            className="h-12 rounded-xl flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
            style={{ background: "var(--surface2)", color: "var(--text)" }}
            onClick={moveRight}
          >
            →
          </button>
          <button
            className="h-12 rounded-xl flex items-center justify-center text-xl font-bold active:scale-90 transition-transform"
            style={{ background: "color-mix(in srgb, var(--warm) 15%, transparent)", color: "var(--warm)" }}
            onClick={hardDrop}
          >
            ⤓
          </button>
        </div>
      )}

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
          <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>{score} pts</p>
          <p className="text-xs mb-3" style={{ color: "var(--dim)" }}>Niveau {level} · {lines} lignes</p>
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
