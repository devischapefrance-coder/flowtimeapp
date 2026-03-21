"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useUnreadPrivateMessages(userId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    // Charger le compte initial
    const loadCount = async () => {
      const { count } = await supabase
        .from("private_messages")
        .select("*", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .is("read_at", null);

      setUnreadCount(count ?? 0);
    };

    loadCount();

    // Subscription Realtime pour mise à jour en temps réel
    const channel = supabase
      .channel(`unread-private-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "private_messages",
          filter: `receiver_id=eq.${userId}`,
        },
        () => {
          // Nouveau message privé reçu → incrémenter
          setUnreadCount((prev) => prev + 1);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "private_messages",
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          // Message marqué comme lu → recharger le count
          if (payload.new && (payload.new as Record<string, unknown>).read_at) {
            loadCount();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return unreadCount;
}
