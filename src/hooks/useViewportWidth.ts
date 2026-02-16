"use client";

import { useState, useEffect } from "react";

/**
 * Returns the current window.innerWidth, updated on resize.
 * SSR-safe: returns `fallback` on the server (default 1024).
 */
export function useViewportWidth(fallback = 1024): number {
  const [width, setWidth] = useState(fallback);

  useEffect(() => {
    setWidth(window.innerWidth);
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}
