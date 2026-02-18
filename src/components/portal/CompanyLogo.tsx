"use client";

/**
 * CompanyLogo – single source of truth for company logo rendering.
 *
 * Every surface that shows a company logo MUST use this component
 * so the container shape can never diverge.
 *
 * Container background logic (shared by sidebar, messages, login):
 *   1. Logo has solid bg (squareIconBg non-null) → match it directly.
 *      Light-solid (white) → white container. Dark-solid → coloured container.
 *   2. Logo is transparent (squareIconBg null) →
 *      Dark glyph (squareIconFg "dark") → NEAR_WHITE (icon provides own contrast).
 *      Light glyph or truly-white → darkContrastFill / sidebarBackground.
 *      Mixed/colourful/unknown → brandFill (tinted pastel).
 *   3. Truly-white logo (transparent + light foreground) on dark sidebar →
 *      sidebar colour for contrast.
 *
 * Variants:
 *   "sidebar"    → 20 × 20 px, 4 px corner-radius, 2px padding.
 *   "login"      → 40 × 40 px, 6 px corner-radius, no padding.
 *   "messages"   → 32 × 32 px, fully circular, 4px padding, object-fit: contain.
 *   "login-hero" → 72 × 72 px, 8 px corner-radius, 4px padding.
 *                  Background: transparent (parent provides frosted-glass bg).
 */

interface CompanyLogoProps {
  /** Logo image URL — null/undefined triggers initials fallback */
  logoUrl: string | null | undefined;
  /** Company name — used for alt text and initials derivation */
  companyName: string;
  /** Which surface this logo sits on */
  variant: "sidebar" | "login" | "messages" | "login-hero";
  /**
   * Dominant background colour extracted from the processed squareIcon.
   * Used by "sidebar" and "messages" variants to fill the container
   * so there is no visible gap between logo content and background.
   */
  squareIconBg?: string | null;
  /**
   * Brand accent colour (e.g. theme.accent).
   * Used as a brand-aware container fill when squareIconBg is unavailable,
   * so the padding area shows a brand colour instead of generic gray.
   */
  accentColor?: string | null;
  /**
   * Dominant foreground colour of the logo (extracted server-side).
   * Used to distinguish white logos (null/light → no visible foreground)
   * from coloured logos on a white background (e.g. PracticeCFO).
   */
  logoDominantColor?: string | null;
  /**
   * Foreground tone of the squareIcon: "dark" (dark glyph), "light" (white glyph),
   * or null (mixed/colourful/unknown).
   * Dark glyphs on transparent bg get neutral fill — they provide their own
   * contrast on white, so brand tint would be visually heavy.
   */
  squareIconFg?: "dark" | "light" | null;
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
  "login-hero": {
    /** Large logo for gradient+logo hero fallback on the login page */
    size: 72,
    radius: 8,
    padding: 4,
    initialsClass: "text-xl font-semibold",
  },
} as const;

/** Initials fallback colours (project standard) */
const INITIALS_BG = "#DDE6E4";
const INITIALS_COLOR = "#2F7D73";

/** Shared near-white fill for logo containers (sidebar + messages). */
const NEAR_WHITE = "rgba(255, 255, 255, 0.9)";

/**
 * Create a very light tint from a brand colour.
 * Blends the colour with white at the given `mix` ratio (0 → white, 1 → full colour).
 * Default mix 0.12 produces a subtle brand-tinted pastel that works as a
 * container fill without clashing with the logo's foreground.
 */
function brandTint(hex: string, mix = 0.12): string {
  const h = hex.replace("#", "");
  if (h.length < 6) return NEAR_WHITE;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const tr = Math.round(255 + (r - 255) * mix);
  const tg = Math.round(255 + (g - 255) * mix);
  const tb = Math.round(255 + (b - 255) * mix);
  return `#${[tr, tg, tb].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Check if a hex colour is perceptually light (brightness > 220). */
export function isLightColor(color: string | null | undefined): boolean {
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
  accentColor,
  logoDominantColor,
  squareIconFg,
  sidebarBackground,
}: CompanyLogoProps) {
  const { size, radius, padding: basePadding, initialsClass } = VARIANT_CONFIG[variant];

  const isMessages = variant === "messages";
  const isSidebar = variant === "sidebar";
  const isLogin = variant === "login";
  const isLoginHero = variant === "login-hero";

  // ── Logo background classification ──
  // squareIconBg non-null → solid opaque background baked into the image.
  //   light → white/off-white bg (e.g. BizLionHQ).
  //   dark  → coloured bg (e.g. Slack purple).
  // squareIconBg null → transparent / no consistent edge colour.
  const logoHasLightSolidBg = !!squareIconBg && isLightColor(squareIconBg);
  const logoHasDarkSolidBg  = !!squareIconBg && !isLightColor(squareIconBg);
  const logoIsTransparent   = !squareIconBg;

  // Truly-white logo: transparent background + light/no foreground.
  // These logos are invisible without a dark container behind them
  // (e.g. auricabrand.es — white lettering on transparent background).
  // Logos with a baked-in solid bg are NEVER "truly white" — their own
  // background already provides the contrast their content needs.
  const hasTrulyWhiteLogo = logoIsTransparent && isLightColor(logoDominantColor);

  // Login normally has 0 padding (logo fills the box). But when we add a
  // contrast-fill background for a truly-white logo, give it 4px so the
  // logo doesn't touch the container edges.
  const needsContrastFill = isLogin && logoUrl && hasTrulyWhiteLogo;
  // login-hero always uses its base padding (4px) — the frosted container handles contrast
  const padding = needsContrastFill ? 4 : basePadding;

  const initials = companyName.slice(0, 2).toUpperCase();

  const imgSize = size - padding * 2;
  const innerRadius = Math.max(0, radius - padding);

  // Brand-consistent contrast fill for white logos: prefer the sidebar colour
  // (the brand's own dark surface) so the logo looks intentional, not generic.
  // Falls back to INITIALS_BG only when sidebar is also light or unavailable.
  const darkContrastFill =
    sidebarBackground && !isLightColor(sidebarBackground)
      ? sidebarBackground
      : INITIALS_BG;

  // Brand-aware fill: a light tint derived from the logo's foreground
  // colour (or accent).  Used by sidebar + messages so the padding area
  // shows a subtle brand colour instead of a generic near-white that can
  // create a visible colour-mismatch ring around the logo.
  const brandSource = (!isLightColor(logoDominantColor) ? logoDominantColor : null)
    ?? (!isLightColor(accentColor) ? accentColor : null);
  const brandFill = brandSource ? brandTint(brandSource) : NEAR_WHITE;

  // ── Transparent-logo fill ──
  // Dark glyph (e.g. knightvision.ca — dark icon on transparent bg):
  //   → NEAR_WHITE.  The dark icon provides its own contrast; brand-fill
  //     would be visually heavy.
  // Light/white glyph (e.g. auricabrand.es — white lettering on transparent bg):
  //   → needs a dark contrast fill so it's visible.
  // Mixed/colourful/unknown:
  //   → brandFill (subtle brand-tinted pastel).
  const transparentFill =
    squareIconFg === "dark" ? NEAR_WHITE : brandFill;

  // Background per variant (when logoUrl exists):
  //   sidebar  → solid bg: match it.  Transparent: transparentFill.
  //             Exception: truly-white logo on dark sidebar → sidebar colour.
  //   messages → solid bg: match it.  Transparent: transparentFill.
  //   login    → solid bg: match it.  Transparent + white: darkContrastFill.
  //   login-hero → transparent (parent frosted-glass).
  const containerBg = logoUrl
    ? (() => {
        if (isSidebar) {
          // Truly-white logo (transparent bg, light/no foreground) on dark sidebar →
          // use the sidebar colour so the white logo gets dark contrast.
          if (
            hasTrulyWhiteLogo &&
            sidebarBackground &&
            !isLightColor(sidebarBackground)
          ) {
            return sidebarBackground;
          }
          // Solid background (dark or light) → match it directly.
          if (logoHasDarkSolidBg) return squareIconBg;
          if (logoHasLightSolidBg) return squareIconBg;
          // Transparent logo → tone-aware fill.
          return transparentFill;
        }
        if (isMessages) {
          // Solid background (dark or light) → match it directly.
          if (logoHasDarkSolidBg) return squareIconBg;
          if (logoHasLightSolidBg) return squareIconBg;
          // Transparent logo → tone-aware fill.
          return transparentFill;
        }
        // login-hero → always transparent (parent provides frosted-glass bg)
        if (isLoginHero) return "transparent";
        // login — same pattern: solid bg → match it, transparent white → contrast fill.
        if (logoHasDarkSolidBg) return squareIconBg;
        if (logoHasLightSolidBg) return squareIconBg;
        if (hasTrulyWhiteLogo) return darkContrastFill;
        return "transparent";
      })()
    : INITIALS_BG;

  // Show a subtle neutral border when the container could blend into its
  // surroundings:
  //   • messages — always, to match the user avatar's `border-neutral-200`.
  //   • login — when the logo has a light/white baked-in background, so it
  //     doesn't vanish against the white login page.  Uses the same #E5E7EB
  //     as the form inputs and dividers below it.
  const showBorder = isMessages || (isLogin && logoUrl && logoHasLightSolidBg);

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
            borderRadius: innerRadius,
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
