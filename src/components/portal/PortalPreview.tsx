"use client";

import { useRef, useEffect, useCallback } from "react";
import type { GeneratedPreviewPayload } from "@/types/preview";
import { LoginView } from "./LoginView";
import { DashboardView } from "./DashboardView";
import { MessagesView } from "./MessagesView";

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

const AUTOPLAY_SPEED = 0.35; // cards per second
const FRICTION = 0.92; // drag momentum decay per frame
const SNAP_STIFFNESS = 0.08; // spring toward nearest integer pos
const SNAP_THRESHOLD = 0.01; // close enough to snap hard
const RESUME_DELAY = 1500; // ms before autoplay resumes after mouse leave
const DOT_SPRING = 0.15; // dot indicator spring stiffness

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

  /* ─── Core animation loop ─── */
  const tick = useCallback(
    (time: number) => {
      if (!lastTime.current) lastTime.current = time;
      const dt = Math.min((time - lastTime.current) / 1000, 0.05); // cap at 50ms
      lastTime.current = time;

      if (!isDragging.current) {
        if (autoplayActive.current && !isPaused.current) {
          // Autoplay: constant speed forward
          pos.current += AUTOPLAY_SPEED * dt;
        } else if (Math.abs(vel.current) > 0.001) {
          // Momentum from drag release
          pos.current += vel.current * dt;
          vel.current *= FRICTION;
        } else {
          // Snap to nearest integer via spring
          vel.current = 0;
          const nearest = Math.round(pos.current);
          const delta = nearest - pos.current;
          if (Math.abs(delta) > SNAP_THRESHOLD) {
            pos.current += delta * SNAP_STIFFNESS;
          } else {
            pos.current = nearest;
          }
        }
      }

      // Wrap position
      pos.current = wrap(pos.current, N);

      // Spring-animate dot position toward pos
      const dotDelta = shortestDelta(dotPos.current, pos.current, N);
      if (Math.abs(dotDelta) > SNAP_THRESHOLD) {
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
    const centerX = viewportW / 2 - CARD_W / 2;

    for (let i = 0; i < track.children.length; i++) {
      const card = track.children[i] as HTMLElement;
      const d = shortestDelta(pos.current, i, N);
      const x = centerX + d * SPACING;

      card.style.transform = `translate3d(${x}px, 0, 0)`;

      // Opacity: centered card = 1, others fade
      const absDist = Math.abs(d);
      const opacity = Math.max(0, 1 - absDist * 0.3);
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

  /* ─── Start / stop animation loop ─── */
  useEffect(() => {
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [tick]);

  /* ─── Autoplay when payload arrives ─── */
  useEffect(() => {
    if (payload && !isLoading) {
      pos.current = 0;
      vel.current = 0;
      autoplayActive.current = true;
    } else if (isLoading) {
      // During loading, no autoplay — static cards
      autoplayActive.current = false;
      pos.current = 0;
      vel.current = 0;
    } else {
      autoplayActive.current = false;
    }
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, [payload, isLoading]);

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
      // Convert px delta to position delta (negative because drag-right = lower index)
      const posDelta = -dx / SPACING;
      pos.current = wrap(dragStartPos.current + posDelta, N);
    },
    []
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const dx = e.clientX - dragStartX.current;
      // Flick velocity: px/frame → cards/sec (approximate)
      vel.current = (-dx / SPACING) * 2;
      // Clamp velocity
      vel.current = Math.max(-3, Math.min(3, vel.current));
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
      {/* Carousel viewport — full-width breakout */}
      <div
        ref={viewportRef}
        className="overflow-hidden"
        style={{
          width: "100vw",
          marginLeft: "calc(50% - 50vw)",
          height: `${CARD_H}px`,
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
          style={{ height: `${CARD_H}px` }}
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
                {/* Content renders only when payload is ready */}
                {!isLoading && payload && (
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
