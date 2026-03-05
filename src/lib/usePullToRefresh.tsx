"use client";

import { useRef, useEffect, useState, useCallback } from "react";

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const threshold = 80;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0 && window.scrollY === 0) {
      setPullDistance(Math.min(dy * 0.5, 120));
    }
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      setPullDistance(threshold);
      await onRefresh();
      setRefreshing(false);
    }
    setPullDistance(0);
    setPulling(false);
  }, [pullDistance, refreshing, onRefresh]);

  useEffect(() => {
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", handleTouchEnd);
    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { pullDistance, refreshing };
}

export function PullIndicator({ pullDistance, refreshing }: { pullDistance: number; refreshing: boolean }) {
  if (pullDistance === 0 && !refreshing) return null;
  return (
    <div
      className="fixed top-0 left-1/2 -translate-x-1/2 flex items-center justify-center z-[200]"
      style={{
        maxWidth: 430,
        width: "100%",
        height: pullDistance,
        transition: refreshing ? "none" : "height 0.15s ease-out",
      }}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
        style={{
          background: "var(--surface2)",
          transform: `rotate(${pullDistance * 3}deg)`,
          opacity: Math.min(pullDistance / 80, 1),
          animation: refreshing ? "spin 0.8s linear infinite" : "none",
        }}
      >
        ↻
      </div>
    </div>
  );
}
