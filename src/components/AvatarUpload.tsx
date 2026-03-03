"use client";

import { useState, useRef } from "react";
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    // Show preview immediately
    setPreview(URL.createObjectURL(file));

    const url = await uploadAvatar(userId, file);
    if (url) {
      setPreview(url);
      onUploaded(url);
    }
    setUploading(false);
  }

  return (
    <>
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
        {/* Edit badge */}
        <div
          className="absolute bottom-0 right-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          ✎
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </>
  );
}
