"use client";

import { useState, useRef, useCallback } from "react";
import { uploadAvatar } from "@/lib/storage";

interface AvatarUploadProps {
  userId: string;
  currentUrl?: string | null;
  emoji: string;
  onUploaded: (url: string) => void;
  size?: number;
}

export default function AvatarUpload({ userId, currentUrl, emoji, onUploaded, size = 60 }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl || null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setCropFile(file);
    setCropSrc(objectUrl);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  // Touch handlers for pan
  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { active: true, startDist: Math.hypot(dx, dy), startScale: scale };
      return;
    }
    const t = e.touches[0];
    dragRef.current = { dragging: true, startX: t.clientX, startY: t.clientY, origX: offset.x, origY: offset.y };
  }

  function onTouchMove(e: React.TouchEvent) {
    if (pinchRef.current.active && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.max(0.5, Math.min(4, pinchRef.current.startScale * (dist / pinchRef.current.startDist)));
      setScale(newScale);
      return;
    }
    if (!dragRef.current.dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.startX;
    const dy = t.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }

  function onTouchEnd() {
    dragRef.current.dragging = false;
    pinchRef.current.active = false;
  }

  // Mouse fallback for desktop
  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }

  function onMouseUp() {
    dragRef.current.dragging = false;
  }

  const cropAndUpload = useCallback(async () => {
    if (!cropFile || !imgRef.current) return;
    setUploading(true);

    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const outputSize = 400;
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The crop circle is 200px in the UI. Map offset/scale to canvas.
    const uiSize = 200;
    const ratio = outputSize / uiSize;

    // Calculate image draw params
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    // Image is displayed to fill the uiSize, then scaled
    const fitScale = Math.max(uiSize / imgW, uiSize / imgH);
    const drawW = imgW * fitScale * scale * ratio;
    const drawH = imgH * fitScale * scale * ratio;
    const drawX = (outputSize - drawW) / 2 + offset.x * ratio;
    const drawY = (outputSize - drawH) / 2 + offset.y * ratio;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    canvas.toBlob(async (blob) => {
      if (!blob) { setUploading(false); return; }
      const file = new File([blob], "avatar.png", { type: "image/png" });
      const url = await uploadAvatar(userId, file);
      if (url) {
        setPreview(url);
        onUploaded(url);
      }
      setCropSrc(null);
      setCropFile(null);
      setUploading(false);
    }, "image/png", 0.95);
  }, [cropFile, scale, offset, userId, onUploaded]);

  return (
    <>
      {/* Avatar button */}
      <button
        className="flex items-center justify-center rounded-full relative overflow-hidden"
        style={{
          width: size,
          height: size,
          background: "var(--surface2)",
          fontSize: size * 0.5,
        }}
        onClick={() => inputRef.current?.click()}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Avatar" className="w-full h-full object-cover rounded-full" />
        ) : (
          emoji
        )}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.5)" }}>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* Edit overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 hover:opacity-100 transition-opacity"
          style={{ background: "rgba(0,0,0,0.4)" }}
        >
          <span className="text-base">📷</span>
        </div>
        {/* Edit badge */}
        <div
          className="absolute bottom-0 right-0 flex items-center justify-center rounded-full"
          style={{
            width: size * 0.33,
            height: size * 0.33,
            background: "var(--accent)",
            color: "#fff",
            fontSize: size * 0.17,
            border: "2px solid var(--surface-solid)",
          }}
        >
          📷
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Crop modal */}
      {cropSrc && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 700, background: "rgba(0,0,0,0.8)" }}
        >
          <div className="flex flex-col items-center gap-4 px-6" style={{ maxWidth: 430, width: "100%" }}>
            <p className="text-sm font-bold text-white">Ajuster la photo</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>Glisse pour repositionner, pince pour zoomer</p>

            {/* Crop area */}
            <div
              className="relative rounded-full overflow-hidden"
              style={{
                width: 200,
                height: 200,
                border: "3px solid var(--accent)",
                touchAction: "none",
                cursor: "move",
              }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={cropSrc}
                alt="Crop"
                draggable={false}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  minWidth: "100%",
                  minHeight: "100%",
                  objectFit: "cover",
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* Zoom slider */}
            <div className="flex items-center gap-3 w-full px-4">
              <span className="text-xs text-white">−</span>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="flex-1"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="text-xs text-white">＋</span>
            </div>

            {/* Actions */}
            <div className="flex gap-3 w-full">
              <button
                className="btn btn-secondary flex-1"
                onClick={() => {
                  if (cropSrc) URL.revokeObjectURL(cropSrc);
                  setCropSrc(null);
                  setCropFile(null);
                }}
              >
                Annuler
              </button>
              <button
                className="btn btn-primary flex-1"
                onClick={cropAndUpload}
                disabled={uploading}
              >
                {uploading ? "Envoi..." : "Valider"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
