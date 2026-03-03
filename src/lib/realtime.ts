"use client";

import { useEffect } from "react";
import { supabase } from "./supabase";

export function useRealtimeEvents(familyId: string | undefined, onUpdate: () => void) {
  useEffect(() => {
    if (!familyId) return;

    const channel = supabase
      .channel(`events:${familyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "events",
          filter: `family_id=eq.${familyId}`,
        },
        () => {
          onUpdate();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyId, onUpdate]);
}
