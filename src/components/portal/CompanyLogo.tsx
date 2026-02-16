"use client";

/**
 * CompanyLogo – single source of truth for company logo rendering.
 *
 * Every surface that shows a company logo MUST use this component
 * so the container shape can never diverge.
 *
 * Variants:
 *   "sidebar"  → 20 × 20 px, 4 px corner-radius.
 *               When squareIconBg is known: 2px padding + matched bg (seamless).
 *               When unknown: 2px padding + near-white bg (visible container).
 *               Exception: light squareIconBg on dark sidebar → use sidebar colour.
 *   "login"    → 40 × 40 px, 6 px corner-radius, no padding.
 *               Background: squareIconBg when coloured, else transparent.
 *               Exception: white logo (light bg + no foreground colour) → sidebar fill.
 *   "messages" → 32 × 32 px, fully circular, 4px padding, object-fit: contain.
 *               Background: squareIconBg ▸ near-white fallback.
 *               Exception: white logo (light bg + no foreground colour) → sidebar fill.
 */

interface CompanyLogoProps {
  /** Logo image URL — null/undefined triggers initials fallback */
  logoUrl: string | null | undefined;
  /** Company name — used for alt text and initials derivation */
  companyName: string;
  /** Which surface this logo sits on */
  variant: "sidebar" | "login" | "messages";
  /**
   * Dominant background colour extracted from the processed squareIcon.
   * Used by "sidebar" and "messages" variants to fill the container
   * so there is no visible gap between logo content and background.
   */
  squareIconBg?: string | null;
  /**
   * Brand accent colour — reserved for future use.
   * Currently unused: both sidebar and messages use near-white fallback.
   */
  accentColor?: string | null;
  /**
   * Dominant foreground colour of the logo (extracted server-side).
   * Used to distinguish white logos (null/light → no visible foreground)
   * from coloured logos on a white background (e.g. PracticeCFO).
   */
  logoDominantColor?: string | null;
  /**
   * Sidebar background colour — used by all variants to provide contrast
   * for white/light logos. When squareIconBg is light, the sidebar colour
   * gives the container a brand-consistent dark fill instead of a generic neutral.
   */
  sidebarBackground?: string;
}

const VARIANT_CONFIG = {
  sidebar: {
    /** px */
    size: 20,
    /** px */
    radius: 4,
    /** Small padding — icon sits inside a rounded container */
    padding: 2,
    /** Tailwind-compatible text size for initials */
    initialsClass: "text-[9px] font-bold",
  },
  login: {
    size: 40,
    radius: 6,
    padding: 0,
    initialsClass: "text-sm font-semibold",
  },
  messages: {
    /** Matches user avatar: 32×32 circle with 1px neutral-200 border */
    size: 32,
    radius: 9999,
    padding: 4,
    initialsClass: "text-[10px] font-medium",
  },
} as const;

/** Initials fallback colours (project standard) */
const INITIALS_BG = "#DDE6E4";
const INITIALS_COLOR = "#2F7D73";

/** Shared near-white fill for logo containers (sidebar + messages). */
const NEAR_WHITE = "rgba(255, 255, 255, 0.9)";

/** Check if a hex colour is perceptually light (brightness > 220). */
function isLightColor(color: string | null | undefined): boolean {
  if (!color) return true;
  const hex = color.replace("#", "");
  if (hex.length < 6) return true;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // ITU-R BT.601 perceived brightness
  return (r * 299 + g * 587 + b * 114) / 1000 > 220;
}

// ─── Component ──────────────────────────────────────────────────────────

export function CompanyLogo({
  logoUrl,
  companyName,
  variant,
  squareIconBg,
  logoDominantColor,
  sidebarBackground,
}: CompanyLogoProps) {
  const { size, radius, padding: basePadding, initialsClass } = VARIANT_CONFIG[variant];

  const isMessages = variant === "messages";
  const isSidebar = variant === "sidebar";

  const isLogin = variant === "login";

  // White-logo detection: the logo truly needs a dark container when BOTH:
  //   1. squareIconBg is explicitly light (the image background is white)
  //   2. logoDominantColor is null or light (the foreground is also white/invisible)
  // A light bg alone is NOT enough — e.g. PracticeCFO has a white bg but a
  // coloured logo, so it renders fine on white.  Only truly white-on-white
  // logos (like auricabrand.es) get the dark contrast fill.
  const hasWhiteLogo =
    !!squareIconBg &&
    isLightColor(squareIconBg) &&
    isLightColor(logoDominantColor);

  // Login normally has 0 padding (logo fills the box). But when we add a
  // contrast-fill background for a white logo, give it 4px so the logo
  // doesn't touch the container edges.
  const needsContrastFill = isLogin && logoUrl && hasWhiteLogo;
  const padding = needsContrastFill ? 4 : basePadding;

  const initials = companyName.slice(0, 2).toUpperCase();

  const imgSize = size - padding * 2;

  // Brand-consistent contrast fill for white logos: prefer the sidebar colour
  // (the brand's own dark surface) so the logo looks intentional, not generic.
  // Falls back to INITIALS_BG only when sidebar is also light or unavailable.
  const darkContrastFill =
    sidebarBackground && !isLightColor(sidebarBackground)
      ? sidebarBackground
      : INITIALS_BG;

  // Background per variant (when logoUrl exists):
  //   sidebar  → squareIconBg ▸ near-white.  Light bg + dark sidebar → sidebar colour.
  //   messages → squareIconBg ▸ near-white.  Explicit light bg → darkContrastFill.
  //   login    → squareIconBg ▸ transparent.  Explicit light bg → darkContrastFill.
  const containerBg = logoUrl
    ? (() => {
        if (isSidebar) {
          const bg = squareIconBg ?? NEAR_WHITE;
          // Sidebar: also fall back when squareIconBg is unknown (null),
          // because the near-white container on a dark sidebar looks wrong
          // for any logo that was designed for a dark surface.
          if (
            isLightColor(squareIconBg) &&
            sidebarBackground &&
            !isLightColor(sidebarBackground)
          ) {
            return sidebarBackground;
          }
          return bg;
        }
        if (isMessages) {
          if (hasWhiteLogo) return darkContrastFill;
          return squareIconBg ?? NEAR_WHITE;
        }
        // login
        if (hasWhiteLogo) return darkContrastFill;
        return squareIconBg ?? "transparent";
      })()
    : INITIALS_BG;

  // Messages avatar always shows a neutral border to match the Ana Eremina
  // avatar (which has `border border-neutral-200`).  Keeps them visually paired.
  const showBorder = isMessages;

  return (
    <div
      className="flex items-center justify-center shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: containerBg,
        padding: padding || undefined,
        ...(showBorder && { border: "1px solid #E5E7EB" }),
      }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={companyName}
          style={{
            width: imgSize,
            height: imgSize,
            objectFit: "contain",
          }}
        />
      ) : (
        <span className={initialsClass} style={{ color: INITIALS_COLOR }}>
          {initials}
        </span>
      )}
    </div>
  );
}
