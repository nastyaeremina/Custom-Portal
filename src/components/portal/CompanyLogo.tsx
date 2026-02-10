"use client";

/**
 * CompanyLogo – single source of truth for company logo rendering.
 *
 * Every surface that shows a company logo MUST use this component
 * so the container shape can never diverge.
 *
 * Variants:
 *   "sidebar"  → 20 × 20 px, 2 px corner-radius, 2px padding, object-fit: contain
 *   "login"    → 40 × 40 px, 6 px corner-radius, no padding, object-fit: contain
 *   "messages" → 32 × 32 px, fully circular, 1px neutral-200 border,
 *                4px padding, object-fit: contain.
 *                When squareIconBg is provided, the container fills with that
 *                colour so the logo blends seamlessly with its own background.
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
   * Only used by the "messages" variant to fill the circular container
   * so there is no visible gap between logo content and border.
   */
  squareIconBg?: string | null;
}

const VARIANT_CONFIG = {
  sidebar: {
    /** px */
    size: 20,
    /** px */
    radius: 2,
    /** Small internal padding so logo doesn't touch container edges */
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

export function CompanyLogo({ logoUrl, companyName, variant, squareIconBg }: CompanyLogoProps) {
  const { size, radius, padding, initialsClass } = VARIANT_CONFIG[variant];

  const initials = companyName.slice(0, 2).toUpperCase();

  const imgSize = size - padding * 2;

  const isMessages = variant === "messages";

  // Messages variant: use squareIconBg when available so the container
  // background matches the logo's own background (e.g. WeWork dark square).
  // For other variants or when no bg is known, stay transparent.
  const containerBg = logoUrl
    ? isMessages && squareIconBg
      ? squareIconBg
      : "transparent"
    : INITIALS_BG;

  // Always show border on messages variant for visual consistency.
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
