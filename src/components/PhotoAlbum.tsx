"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { FamilyPhoto } from "@/lib/types";

interface PhotoAlbumProps {
  photos: FamilyPhoto[];
  familyId: string;
  userName: string;
  onUpdate: () => void;
}

function getWeekLabel(date: string): string {
  const d = new Date(date);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function weekLabelDisplay(wl: string): string {
  const [year, week] = wl.split("-W");
  return `Semaine ${parseInt(week)} — ${year}`;
}

export default function PhotoAlbum({ photos, familyId, userName, onUpdate }: PhotoAlbumProps) {
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<FamilyPhoto | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Group by week
  const byWeek = new Map<string, FamilyPhoto[]>();
  for (const p of photos) {
    const wl = p.week_label || getWeekLabel(p.created_at);
    if (!byWeek.has(wl)) byWeek.set(wl, []);
    byWeek.get(wl)!.push(p);
  }
  const weeks = [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !familyId) return;
    setUploading(true);

    try {
      const timestamp = Date.now();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${familyId}/${timestamp}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("family-photos")
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("family-photos")
        .getPublicUrl(path);

      await supabase.from("family_photos").insert({
        family_id: familyId,
        url: urlData.publicUrl,
        caption: "",
        uploaded_by: userName,
        week_label: getWeekLabel(new Date().toISOString()),
      });

      onUpdate();
    } catch (err) {
      console.error("Upload error:", err);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function updateCaption(id: string, caption: string) {
    await supabase.from("family_photos").update({ caption }).eq("id", id);
    onUpdate();
  }

  async function deletePhoto(id: string) {
    if (!confirm("Supprimer cette photo ?")) return;
    await supabase.from("family_photos").delete().eq("id", id);
    setLightbox(null);
    onUpdate();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="label !mb-0">Album photo</p>
        <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={handleUpload} />
        <button
          className="px-3 py-1.5 rounded-xl text-xs font-bold"
          style={{ background: "var(--accent)", color: "#fff" }}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Upload..." : "+ Photo"}
        </button>
      </div>

      {photos.length === 0 && (
        <div className="text-center py-8">
          <p className="text-3xl mb-2">📸</p>
          <p className="text-sm" style={{ color: "var(--dim)" }}>Aucune photo pour le moment</p>
        </div>
      )}

      {weeks.map(([weekLabel, weekPhotos]) => (
        <div key={weekLabel} className="mb-4">
          <p className="text-[10px] font-bold uppercase mb-2" style={{ color: "var(--dim)" }}>
            {weekLabelDisplay(weekLabel)}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {weekPhotos.map((photo) => (
              <button
                key={photo.id}
                className="aspect-square rounded-xl overflow-hidden"
                onClick={() => { setLightbox(photo); setEditCaption(photo.caption); }}
              >
                <img
                  src={photo.url}
                  alt={photo.caption}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[800] flex flex-col"
          style={{ background: "var(--overlay)", maxWidth: 430, margin: "0 auto" }}
          onClick={() => setLightbox(null)}
        >
          <div className="flex justify-end" style={{ padding: "max(16px, env(safe-area-inset-top, 16px)) 16px 8px 16px" }}>
            <button
              className="w-9 h-9 flex items-center justify-center rounded-full text-white text-lg"
              style={{ background: "var(--faint)" }}
              onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            >
              ✕
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.caption} className="max-w-full max-h-[60vh] rounded-xl object-contain" />
          </div>
          <div className="p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-2 mb-2">
              <input
                className="flex-1 px-3 py-2 rounded-xl text-sm"
                style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--glass-border)" }}
                value={editCaption}
                onChange={(e) => setEditCaption(e.target.value)}
                placeholder="Ajouter une legende..."
                onBlur={() => { if (editCaption !== lightbox.caption) updateCaption(lightbox.id, editCaption); }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "var(--dim)" }}>
                Par {lightbox.uploaded_by} · {new Date(lightbox.created_at).toLocaleDateString("fr-FR")}
              </span>
              <button
                className="text-xs px-2 py-1 rounded-lg"
                style={{ color: "var(--red)" }}
                onClick={() => deletePhoto(lightbox.id)}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
