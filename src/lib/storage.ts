import { supabase } from "./supabase";

function cropToSquare(file: File, size: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("No blob"))),
        "image/webp",
        0.85
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadAvatar(userId: string, file: File): Promise<string | null> {
  try {
    const cropped = await cropToSquare(file, 256);
    const path = `${userId}/avatar.webp`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, cropped, { contentType: "image/webp", upsert: true });

    if (error) {
      console.error("Avatar upload error:", error.message, error);
      return null;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = data.publicUrl + "?t=" + Date.now();

    // Update profile
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);

    return url;
  } catch (err) {
    console.error("Avatar upload exception:", err);
    return null;
  }
}

export function getAvatarUrl(userId: string): string {
  const { data } = supabase.storage.from("avatars").getPublicUrl(`${userId}/avatar.webp`);
  return data.publicUrl;
}
