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
    // Reset input so same file can be re-selected
    e.target.value = "";
  }

  function onTouchStart(e: React.TouchEvent) {
    e.preventDefault();
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
    e.preventDefault();
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
    setOffset({
      x: dragRef.current.origX + (t.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (t.clientY - dragRef.current.startY),
    });
  }

  function onTouchEnd() {
    dragRef.current.dragging = false;
    pinchRef.current.active = false;
  }

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragRef.current.dragging) return;
    setOffset({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  }
  function onMouseUp() { dragRef.current.dragging = false; }

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

    const uiSize = 200;
    const ratio = outputSize / uiSize;
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    const fitScale = Math.max(uiSize / imgW, uiSize / imgH);
    const drawW = imgW * fitScale * scale * ratio;
    const drawH = imgH * fitScale * scale * ratio;
    const drawX = (outputSize - drawW) / 2 + offset.x * ratio;
    const drawY = (outputSize - drawH) / 2 + offset.y * ratio;

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
      if (cropSrc) URL.revokeObjectURL(cropSrc);
      setCropSrc(null);
      setCropFile(null);
      setUploading(false);
    }, "image/png", 0.95);
  }, [cropFile, cropSrc, scale, offset, userId, onUploaded]);

  const badgeSize = Math.round(size * 0.35);

  return (
    <>
      {/* Wrapper — no overflow hidden so badge can escape */}
      <div className="relative" style={{ width: size, height: size }}>
        {/* Avatar circle */}
        <button
          className="flex items-center justify-center rounded-full overflow-hidden"
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
            <img src={preview} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            emoji
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </button>

        {/* Badge — outside the button, in front of everything */}
        <div
          className="absolute flex items-center justify-center rounded-full pointer-events-none"
          style={{
            width: badgeSize,
            height: badgeSize,
            bottom: -2,
            right: -2,
            background: "var(--accent)",
            border: "2px solid var(--surface-solid)",
            fontSize: badgeSize * 0.5,
            zIndex: 10,
          }}
        >
          📷
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Crop screen */}
      {cropSrc && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center"
          style={{ zIndex: 700, background: "rgba(0,0,0,0.9)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-bold text-white mb-1">Ajuster la photo</p>
          <p className="text-xs mb-6" style={{ color: "rgba(255,255,255,0.5)" }}>Glisse pour repositionner</p>

          {/* Crop area */}
          <div
            className="relative rounded-full overflow-hidden"
            style={{
              width: 220,
              height: 220,
              border: "3px solid var(--accent)",
              touchAction: "none",
              cursor: "move",
              background: "#000",
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
                userSelect: "none",
              }}
              onLoad={() => {
                // Reset position when new image loads
                setOffset({ x: 0, y: 0 });
                setScale(1);
              }}
            />
          </div>

          {/* Zoom controls — custom buttons instead of broken range input */}
          <div className="flex items-center gap-4 mt-6 mb-6">
            <button
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
              onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
            >
              −
            </button>
            {/* Visual scale indicator */}
            <div className="flex items-center gap-1">
              {[0.5, 1, 1.5, 2, 2.5, 3].map((s) => (
                <div
                  key={s}
                  className="rounded-full transition-all"
                  style={{
                    width: scale >= s ? 8 : 5,
                    height: scale >= s ? 8 : 5,
                    background: scale >= s ? "var(--accent)" : "rgba(255,255,255,0.2)",
                  }}
                />
              ))}
            </div>
            <button
              className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
              onClick={() => setScale((s) => Math.min(3, s + 0.15))}
            >
              ＋
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-3 px-6" style={{ width: "100%", maxWidth: 320 }}>
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
      )}
    </>
  );
}
