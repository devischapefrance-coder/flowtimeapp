"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        // Force update check on every page load
        reg.update().catch(() => {});
      }).catch(() => {});
    }
  }, []);
  return null;
}
