"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { GeneratedPreviewPayload } from "@/types/preview";
import { useViewportWidth } from "@/hooks/useViewportWidth";
import { LoginView } from "./LoginView";
import { DashboardView } from "./DashboardView";
import { MessagesView } from "./MessagesView";
import { CardSkeleton } from "./CardSkeleton";

interface PortalPreviewProps {
  payload: GeneratedPreviewPayload | null;
  isLoading: boolean;
}

/* ─── Per-card viewport configs (measured from Figma) ─── */
/* Each card in Figma has:
 *   - An outer clip frame (beige rounded rect): 660 × figmaCardH
 *   - An inner screen component: innerW × innerH, offset by (padLeft, padTop)
 * We render at a uniform CARD_H, so we scale each card's Figma layout
 * to fit: scale = CARD_H_UNIFORM / figmaCardH
 */
const CARD_CONFIGS = {
  login: {
    figmaCardH: 525,
    innerW: 626,
    innerH: 465,
    padTop: 31,
    padLeft: 34,
  },
  home: {
    figmaCardH: 529,
    innerW: 632,
    innerH: 476,
    padTop: 33,
    padLeft: 34,
  },
  messages: {
    figmaCardH: 527,
    innerW: 628,
    innerH: 496,
    padTop: 31,
    padLeft: 35,
  },
} as const;

const SCREENS = [
  { id: "login", label: "Log In" },
  { id: "home", label: "Home" },
  { id: "messages", label: "Messages" },
] as const;

const N = SCREENS.length;

/* ─── Carousel constants ─── */
const CARD_W = 660;
const CARD_H = 525;
const CARD_GAP = 25;
const SPACING = CARD_W + CARD_GAP; // center-to-center distance

// ── Motion tuning ──
const AUTOPLAY_SPEED    = 0.18;     // cards/sec (slower, more premium)
const AUTOPLAY_RAMP_MS  = 500;      // ease-in duration when autoplay resumes
const DRAG_RESISTANCE   = 0.85;     // pointer delta multiplier (dampens fast drags)
const MAX_FLICK_VEL     = 2.0;      // max cards/sec after drag release
const FRICTION_TAU      = 550;      // momentum decay time constant in ms (time-based)
const VEL_DEADZONE      = 0.0005;   // below this → velocity = 0

// Snap spring-damper (critically damped feel)
const SNAP_K            = 0.035;    // spring stiffness
const SNAP_C            = 0.12;     // damping coefficient
const SNAP_POS_EPS      = 0.002;    // position "close enough"
const SNAP_VEL_EPS      = 0.0003;   // velocity "close enough"

const RESUME_DELAY      = 1500;     // ms before autoplay resumes after mouse leave
const DOT_SPRING        = 0.08;     // dot indicator stiffness (smoother lag)



/* ─── Circular math helpers ─── */

/** Wrap x into [0, n) */
function wrap(x: number, n: number): number {
  return ((x % n) + n) % n;
}

/** Shortest signed delta from a to b on a ring of size n, in (-n/2, n/2] */
function shortestDelta(from: number, to: number, n: number): number {
  const raw = wrap(to - from, n);
  return raw > n / 2 ? raw - n : raw;
}

export function PortalPreview({ payload, isLoading }: PortalPreviewProps) {
  /* ─── Refs for animation state (not React state — 60fps) ─── */
  const pos = useRef(0); // continuous float position [0..N)
  const vel = useRef(0); // velocity in cards/sec (drag momentum)
  const dotPos = useRef(0); // spring-animated dot position
  const rafId = useRef(0);
  const lastTime = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const isPaused = useRef(false); // hover pause
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartPos = useRef(0);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoplayActive = useRef(false);
  const autoplayResumeAt = useRef(0); // timestamp when autoplay resumed (for ease-in)
  const prefersReducedMotion = useRef(false);

  /* ─── Responsive card scaling ─── */
  const vw = useViewportWidth();
  const MOBILE_PAD = 16; // px horizontal padding on each side
  const cardScale = Math.min(1, (vw - 2 * MOBILE_PAD) / CARD_W);
  const displayW = CARD_W * cardScale;
  const displayH = CARD_H * cardScale;
  const displaySpacing = displayW + CARD_GAP * cardScale;

  // Store in refs so the 60fps renderFrame() can read them without re-renders
  const displayWRef = useRef(displayW);
  const displaySpacingRef = useRef(displaySpacing);
  const cardScaleRef = useRef(cardScale);

  useEffect(() => {
    displayWRef.current = displayW;
    displaySpacingRef.current = displaySpacing;
    cardScaleRef.current = cardScale;
  }, [displayW, displaySpacing, cardScale]);

  /* ─── Image preloading — hold shimmer until images are cached ─── */
  const [imagesReady, setImagesReady] = useState(false);

  useEffect(() => {
    // Wait until the SSE stream is fully done and payload exists
    if (!payload || isLoading) {
      setImagesReady(false);
      return;
    }

    const urls = [
      payload.images.loginHeroImageUrl,
      payload.images.dashboardHeroImageUrl,
      payload.branding.logoUrl,
    ].filter((u): u is string => !!u);

    if (urls.length === 0) {
      setImagesReady(true);
      return;
    }

    let cancelled = false;
    Promise.all(
      urls.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve(); // don't block on failures
            img.src = src;
          })
      )
    ).then(() => {
      if (!cancelled) setImagesReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [payload, isLoading]);

  /* ─── Core animation loop ─── */
  const tick = useCallback(
    (time: number) => {
      if (!lastTime.current) lastTime.current = time;
      const dtMs = Math.min(time - lastTime.current, 50); // cap at 50ms
      const dt = dtMs / 1000;
      lastTime.current = time;

      const reduced = prefersReducedMotion.current;

      if (!isDragging.current) {
        if (autoplayActive.current && !isPaused.current && !reduced) {
          // Autoplay with smoothstep ease-in ramp
          const elapsed = time - autoplayResumeAt.current;
          const ramp = Math.min(elapsed / AUTOPLAY_RAMP_MS, 1);
          const easedRamp = ramp * ramp * (3 - 2 * ramp); // smoothstep
          pos.current += AUTOPLAY_SPEED * easedRamp * dt;
        } else if (Math.abs(vel.current) > VEL_DEADZONE && !reduced) {
          // Momentum: time-based exponential decay
          pos.current += vel.current * dt;
          vel.current *= Math.exp(-dtMs / FRICTION_TAU);
          if (Math.abs(vel.current) < VEL_DEADZONE) vel.current = 0;
        } else {
          // Snap: critically damped spring
          const nearest = Math.round(pos.current);
          const delta = nearest - pos.current;

          if (reduced) {
            // Reduced motion: snap instantly
            pos.current = nearest;
            vel.current = 0;
          } else if (Math.abs(delta) > SNAP_POS_EPS || Math.abs(vel.current) > SNAP_VEL_EPS) {
            const accel = delta * SNAP_K - vel.current * SNAP_C;
            vel.current += accel * dtMs;
            pos.current += vel.current * dt;
          } else {
            pos.current = nearest;
            vel.current = 0;
          }
        }
      }

      // Wrap position
      pos.current = wrap(pos.current, N);

      // Spring-animate dot position (smoother lag)
      const dotDelta = shortestDelta(dotPos.current, pos.current, N);
      if (Math.abs(dotDelta) > SNAP_POS_EPS) {
        dotPos.current = wrap(dotPos.current + dotDelta * DOT_SPRING, N);
      } else {
        dotPos.current = pos.current;
      }

      // Update DOM directly (no React re-render)
      renderFrame();

      rafId.current = requestAnimationFrame(tick);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /* ─── Render one frame: position cards + update dots ─── */
  const renderFrame = useCallback(() => {
    const track = trackRef.current;
    const dots = dotsRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;

    const viewportW = viewport.offsetWidth;
    const dw = displayWRef.current;
    const ds = displaySpacingRef.current;
    const sc = cardScaleRef.current;
    const centerX = viewportW / 2 - dw / 2;

    for (let i = 0; i < track.children.length; i++) {
      const card = track.children[i] as HTMLElement;
      const d = shortestDelta(pos.current, i, N);
      const x = centerX + d * ds;

      // Position + scale: cards are 660×525 in DOM, visually scaled down on mobile
      card.style.transform = `translate3d(${x}px, 0, 0) scale(${sc})`;
      card.style.transformOrigin = "top left";

      // Opacity: centered card = 1, others fade
      const absDist = Math.abs(d);
      const opacity = Math.max(0, 1 - absDist * 0.35);
      card.style.opacity = String(opacity);
    }

    // Update dot indicator
    if (dots) {
      const activeIdx = Math.round(wrap(dotPos.current, N)) % N;
      for (let i = 0; i < dots.children.length; i++) {
        const dot = dots.children[i] as HTMLElement;
        if (i === activeIdx) {
          dot.style.backgroundColor = "#262626"; // neutral-800
        } else {
          dot.style.backgroundColor = "#d4d4d4"; // neutral-300
        }
      }
    }
  }, []);

  /* ─── Reduced motion preference ─── */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /* ─── Start / stop animation loop ─── */
  useEffect(() => {
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [tick]);

  /* ─── Autoplay when payload + images are ready ─── */
  useEffect(() => {
    if (payload && !isLoading && imagesReady) {
      pos.current = 0;
      vel.current = 0;
      if (!prefersReducedMotion.current) {
        autoplayActive.current = true;
        autoplayResumeAt.current = performance.now();
      }
    } else if (isLoading || !imagesReady) {
      // During loading or image preload — no autoplay, static cards
      autoplayActive.current = false;
      pos.current = 0;
      vel.current = 0;
    } else {
      autoplayActive.current = false;
    }
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [payload, isLoading, imagesReady]);

  /* ─── Hover: pause / resume ─── */
  const handleMouseEnter = useCallback(() => {
    isPaused.current = true;
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current);
      resumeTimer.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPaused.current = false;
    if (!isDragging.current && autoplayActive.current) return; // already playing
    // If we were dragging or paused, resume autoplay after delay
    if (payload) {
      resumeTimer.current = setTimeout(() => {
        if (!isPaused.current) {
          autoplayActive.current = true;
          autoplayResumeAt.current = performance.now();
          vel.current = 0;
        }
      }, RESUME_DELAY);
    }
  }, [payload]);

  /* ─── Drag handlers ─── */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      isDragging.current = true;
      autoplayActive.current = false;
      vel.current = 0;
      dragStartX.current = e.clientX;
      dragStartPos.current = pos.current;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStartX.current;
      // Convert px delta to position delta with drag resistance (responsive spacing)
      const posDelta = (-dx / displaySpacingRef.current) * DRAG_RESISTANCE;
      pos.current = wrap(dragStartPos.current + posDelta, N);
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;

      if (prefersReducedMotion.current) {
        // Snap instantly, no momentum
        vel.current = 0;
        pos.current = Math.round(pos.current);
        return;
      }

      const dx = e.clientX - dragStartX.current;
      vel.current = (-dx / displaySpacingRef.current) * 2;
      vel.current = Math.max(-MAX_FLICK_VEL, Math.min(MAX_FLICK_VEL, vel.current));
    },
    []
  );

  /* ─── Dot click: jump via shortest path ─── */
  const handleDotClick = useCallback((targetIdx: number) => {
    autoplayActive.current = false;
    vel.current = 0;
    // Set velocity toward target via shortest path
    const delta = shortestDelta(pos.current, targetIdx, N);
    // Use a spring-like impulse
    vel.current = delta * 3;
  }, []);

  /* ─── Bail if nothing to show ─── */
  if (!isLoading && !payload) {
    return null;
  }

  /* ─── Render ─── */
  return (
    <div
      className="w-full flex flex-col"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Carousel viewport — full-width breakout, responsive height */}
      <div
        ref={viewportRef}
        className="overflow-hidden"
        style={{
          width: "100vw",
          marginLeft: "calc(50% - 50vw)",
          height: `${displayH}px`,
          cursor: isDragging.current ? "grabbing" : "grab",
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Track — cards positioned absolutely via transform in renderFrame */}
        <div
          ref={trackRef}
          className="relative w-full"
          style={{ height: `${displayH}px` }}
        >
          {SCREENS.map((screen, i) => {
            const cfg = CARD_CONFIGS[screen.id as keyof typeof CARD_CONFIGS];
            // Scale Figma card layout to fit our uniform CARD_H
            const s = CARD_H / cfg.figmaCardH;
            return (
              <div
                key={screen.id}
                className="absolute top-0 left-0 overflow-hidden select-none"
                style={{
                  width: `${CARD_W}px`,
                  height: `${CARD_H}px`,
                  backgroundColor: "#F2F2E8",
                  borderRadius: "9px",
                  border: "1px solid #ECECE0",
                  willChange: "transform, opacity",
                }}
              >
                {/* Shimmer: shown during generation + image preloading */}
                {(isLoading || !imagesReady) && <CardSkeleton />}

                {/* Content: only when payload ready AND images preloaded */}
                {!isLoading && payload && imagesReady && (
                  <div
                    className="pointer-events-auto"
                    style={{
                      width: `${cfg.innerW}px`,
                      height: `${cfg.innerH}px`,
                      transform: `translate(${cfg.padLeft * s}px, ${cfg.padTop * s}px) scale(${s})`,
                      transformOrigin: "top left",
                    }}
                  >
                    {screen.id === "login" && (
                      <LoginView
                        branding={payload.branding}
                        theme={payload.theme}
                        loginHeroImageUrl={payload.images.loginHeroImageUrl}
                      />
                    )}
                    {screen.id === "home" && (
                      <DashboardView
                        branding={payload.branding}
                        theme={payload.theme}
                        dashboardHeroImageUrl={payload.images.dashboardHeroImageUrl}
                      />
                    )}
                    {screen.id === "messages" && (
                      <MessagesView
                        branding={payload.branding}
                        theme={payload.theme}
                        welcomeMessageText={payload.copy.welcomeMessageText}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dot indicators — spring-animated */}
      <div className="flex justify-center pb-4 pt-[32px]">
        <div ref={dotsRef} className="flex items-center gap-[10px]">
          {SCREENS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => handleDotClick(i)}
              aria-label={s.label}
              className="w-[6px] h-[6px] rounded-full transition-none"
              style={{ backgroundColor: i === 0 ? "#262626" : "#d4d4d4" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
