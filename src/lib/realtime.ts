"use client";

import { useEffect, useRef } from "react";
import { supabase } from "./supabase";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export function useRealtimeShopping(familyId: string | undefined, onUpdate: () => void) {
  useEffect(() => {
    if (!familyId) return;

    const channel = supabase
      .channel(`shopping:${familyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shopping_items",
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

export function useRealtimeExpenses(familyId: string | undefined, onUpdate: () => void) {
  useEffect(() => {
    if (!familyId) return;
    const channel = supabase
      .channel(`expenses:${familyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `family_id=eq.${familyId}` }, () => onUpdate())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId, onUpdate]);
}

export function useRealtimeChores(familyId: string | undefined, onUpdate: () => void) {
  useEffect(() => {
    if (!familyId) return;
    const channel = supabase
      .channel(`chores:${familyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chores", filter: `family_id=eq.${familyId}` }, () => onUpdate())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [familyId, onUpdate]);
}

export function useRealtimeNotes(
  familyId: string | undefined,
  currentAuthor: string,
  onUpdate: () => void
) {
  const authorRef = useRef(currentAuthor);
  authorRef.current = currentAuthor;

  useEffect(() => {
    if (!familyId) return;

    const channel = supabase
      .channel(`notes:${familyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notes",
          filter: `family_id=eq.${familyId}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          onUpdate();
          // Web notification if someone else added a note
          if (
            payload.eventType === "INSERT" &&
            payload.new &&
            typeof payload.new.author_name === "string" &&
            payload.new.author_name !== authorRef.current &&
            typeof Notification !== "undefined" &&
            Notification.permission === "granted"
          ) {
            new Notification("Nouvelle note", {
              body: `${payload.new.author_name} a ajoute une note : ${payload.new.title || ""}`,
              icon: "/icon-192x192.png",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyId, onUpdate]);
}
