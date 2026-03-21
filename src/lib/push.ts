"use client";

import { supabase } from "@/lib/supabase";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const reg = await navigator.serviceWorker.ready;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return null;

    // Convert VAPID key to Uint8Array
    const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
    const base64 = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const applicationServerKey = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      applicationServerKey[i] = rawData.charCodeAt(i);
    }

    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    // Send subscription to server
    const authHeaders = await getAuthHeaders();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return subscription;
  } catch {
    return null;
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      const authHeaders = await getAuthHeaders();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    }
  } catch { /* ignore */ }
}

export async function isPushSubscribed(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

/** Send a push notification to all family members (except caller) */
export async function notifyFamily(title: string, body: string): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ title, body }),
    });
  } catch { /* silent — don't block UI for push failures */ }
}

/** Send a push notification to a specific user */
export async function notifyUser(recipientId: string, title: string, body: string, url?: string): Promise<void> {
  try {
    const authHeaders = await getAuthHeaders();
    await fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ title, body, userId: recipientId, url, tag: `private-${recipientId}` }),
    });
  } catch { /* silent */ }
}
