import webpush from "web-push";

export function catEmoji(category: string): string {
  const map: Record<string, string> = {
    sport: "⚽", ecole: "📚", medical: "🏥", loisir: "🎭",
    travail: "💼", famille: "👨‍👩‍👧‍👦", general: "📌",
  };
  return map[category] || "📌";
}

export function getWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) throw new Error("VAPID keys not configured");
  webpush.setVapidDetails("mailto:flowtime@example.com", publicKey, privateKey);
  return webpush;
}
