"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { AppTheme, ThemeMode } from "@/lib/types";

const LS_THEME_KEY = "flowtime_app_theme";
const LS_MODE_KEY = "flowtime_theme_mode";

// Classes à supprimer lors d'un changement de thème
const THEME_CLASSES = ["stone-amber"];
const MODE_CLASSES = ["light"];
// Palettes existantes (pour nettoyage)
const PALETTE_CLASSES = [
  "light", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10",
  "p11", "p12", "p13", "p14", "p15", "p16", "p17", "p18", "p19", "p20",
  "stone-amber",
];

function applyThemeToDOM(theme: AppTheme, mode: ThemeMode) {
  const root = document.documentElement;
  // Retirer toutes les classes de thème/palette
  root.classList.remove(...PALETTE_CLASSES);

  if (theme === "stone-amber") {
    root.classList.add("stone-amber");
    if (mode === "light") {
      root.classList.add("light");
    }
  } else {
    // Thème default — restaurer la palette sélectionnée dans localStorage
    const palette = localStorage.getItem("flowtime_theme") || "dark";
    if (palette !== "dark") {
      if (palette === "system") {
        const resolved = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
        if (resolved === "light") root.classList.add("light");
      } else {
        root.classList.add(palette);
      }
    }
  }
}

interface UseThemeOptions {
  userId?: string;
}

export function useTheme({ userId }: UseThemeOptions = {}) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(LS_THEME_KEY) as AppTheme) || "default";
    }
    return "default";
  });

  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(LS_MODE_KEY) as ThemeMode) || "dark";
    }
    return "dark";
  });

  const [isLoading, setIsLoading] = useState(true);

  // Appliquer au DOM au montage (localStorage = instant, pas de flash)
  useEffect(() => {
    applyThemeToDOM(theme, themeMode);
  }, [theme, themeMode]);

  // Charger depuis Supabase (et mettre à jour si différent du localStorage)
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    supabase
      .from("profiles")
      .select("theme, theme_mode")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data) {
          const dbTheme = (data.theme as AppTheme) || "default";
          const dbMode = (data.theme_mode as ThemeMode) || "dark";

          setThemeState(dbTheme);
          setThemeModeState(dbMode);
          localStorage.setItem(LS_THEME_KEY, dbTheme);
          localStorage.setItem(LS_MODE_KEY, dbMode);
          applyThemeToDOM(dbTheme, dbMode);
        }
        setIsLoading(false);
      });
  }, [userId]);

  const setTheme = useCallback(
    async (newTheme: AppTheme, newMode: ThemeMode) => {
      // Appliquer immédiatement
      setThemeState(newTheme);
      setThemeModeState(newMode);
      localStorage.setItem(LS_THEME_KEY, newTheme);
      localStorage.setItem(LS_MODE_KEY, newMode);
      applyThemeToDOM(newTheme, newMode);

      // Persister en base
      if (userId) {
        await supabase
          .from("profiles")
          .update({ theme: newTheme, theme_mode: newMode })
          .eq("id", userId);
      }
    },
    [userId]
  );

  return { theme, themeMode, setTheme, isLoading };
}
