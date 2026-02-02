import chroma from "chroma-js";
import { PortalColorScheme } from "./types";
import {
  extractAccentFromImageUrl,
  isNeutralColor,
} from "./extractor";

// Default fallback colors
const DEFAULT_COLORS: PortalColorScheme = {
  sidebarBackground: "#1e293b", // Slate 800
  sidebarText: "#ffffff",
  accent: "#3b82f6", // Blue 500
};

export interface AccentColorSource {
  squareIconUrl?: string | null;
  logoUrl?: string | null;
  linkButtonColors?: string[];
}

export interface AccentColorResult {
  color: string | null;
  source: "squareIcon" | "logo" | "linkButton" | "none";
  isHighConfidence: boolean;
}

export interface SidebarColorSource {
  navHeaderBackground?: string | null;
  accentColor?: string | null;
}

export interface SidebarColorResult {
  sidebarBackground: string;
  sidebarText: string;
  source: "navHeader" | "accent" | "default";
}

/**
 * Calculate luminance using the formula: L = 0.299*R + 0.587*G + 0.114*B
 * Returns a value from 0 to 255
 */
function calculateLuminance(hex: string): number {
  try {
    const rgb = chroma(hex).rgb();
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
  } catch {
    return 255; // Default to light if error
  }
}

/**
 * Select sidebar colors based on nav/header background
 *
 * Step 1: Determine sidebar background color
 * - Get nav/header background color
 * - Calculate luminance L = 0.299*R + 0.587*G + 0.114*B
 * - If L ≤ 50 → dark nav → use that same dark color
 * - If L > 50 and L ≤ 186 → medium/colored nav → use that color
 * - If L > 186 or transparent → light/minimal nav → use accent color
 *
 * Step 2: Calculate sidebar text color
 * - If sidebar luminance > 186 → use dark text (#1a1a1a)
 * - If sidebar luminance ≤ 186 → use light text (#ffffff)
 */
export function selectSidebarColors(sources: SidebarColorSource): SidebarColorResult {
  let sidebarBackground: string;
  let source: SidebarColorResult["source"];

  if (sources.navHeaderBackground) {
    const luminance = calculateLuminance(sources.navHeaderBackground);

    if (luminance <= 50) {
      // Dark nav → use that same dark color
      sidebarBackground = sources.navHeaderBackground;
      source = "navHeader";
    } else if (luminance <= 186) {
      // Medium/colored nav → use that color
      sidebarBackground = sources.navHeaderBackground;
      source = "navHeader";
    } else {
      // Light/minimal nav (L > 186) → use accent color
      if (sources.accentColor) {
        sidebarBackground = sources.accentColor;
        source = "accent";
      } else {
        sidebarBackground = DEFAULT_COLORS.sidebarBackground;
        source = "default";
      }
    }
  } else {
    // No nav/header background found → use accent color
    if (sources.accentColor) {
      sidebarBackground = sources.accentColor;
      source = "accent";
    } else {
      sidebarBackground = DEFAULT_COLORS.sidebarBackground;
      source = "default";
    }
  }

  // Step 2: Calculate sidebar text color based on sidebar background luminance
  const sidebarLuminance = calculateLuminance(sidebarBackground);
  const sidebarText = sidebarLuminance > 186 ? "#1a1a1a" : "#ffffff";

  return {
    sidebarBackground,
    sidebarText,
    source,
  };
}

/**
 * Select accent color using the new priority logic:
 * 1. Extract from square icon (favicon)
 * 2. Fall back to logo
 * 3. Fall back to link/button colors from page
 * 4. Return null if nothing found
 */
export async function selectAccentColor(
  sources: AccentColorSource
): Promise<AccentColorResult> {
  console.log("[selectAccentColor] Starting accent color selection");
  console.log(`[selectAccentColor] squareIconUrl: ${sources.squareIconUrl || "none"}`);
  console.log(`[selectAccentColor] logoUrl: ${sources.logoUrl || "none"}`);
  console.log(`[selectAccentColor] linkButtonColors: ${sources.linkButtonColors?.length || 0} colors`);

  // Step 1: Try square icon (favicon)
  if (sources.squareIconUrl) {
    console.log("[selectAccentColor] Step 1: Trying square icon (favicon)...");
    const iconColor = await extractAccentFromImageUrl(sources.squareIconUrl);
    if (iconColor) {
      console.log(`[selectAccentColor] Icon color found: ${iconColor.color}, saturation: ${iconColor.saturation.toFixed(2)}`);
      if (iconColor.saturation >= 0.1) {
        console.log("[selectAccentColor] ✓ Using color from square icon");
        return {
          color: iconColor.color,
          source: "squareIcon",
          isHighConfidence: iconColor.isHighConfidence,
        };
      } else {
        console.log("[selectAccentColor] Icon color saturation too low, skipping");
      }
    } else {
      console.log("[selectAccentColor] No color extracted from square icon");
    }
  }

  // Step 2: Try logo
  if (sources.logoUrl) {
    console.log("[selectAccentColor] Step 2: Trying logo...");
    const logoColor = await extractAccentFromImageUrl(sources.logoUrl);
    if (logoColor) {
      console.log(`[selectAccentColor] Logo color found: ${logoColor.color}, saturation: ${logoColor.saturation.toFixed(2)}`);
      if (logoColor.saturation >= 0.1) {
        console.log("[selectAccentColor] ✓ Using color from logo");
        return {
          color: logoColor.color,
          source: "logo",
          isHighConfidence: logoColor.isHighConfidence,
        };
      } else {
        console.log("[selectAccentColor] Logo color saturation too low, skipping");
      }
    } else {
      console.log("[selectAccentColor] No color extracted from logo");
    }
  }

  // Step 3: Try link/button colors from page
  if (sources.linkButtonColors && sources.linkButtonColors.length > 0) {
    console.log("[selectAccentColor] Step 3: Trying link/button colors...");
    // Filter out neutral colors and sort by frequency (assuming they're already sorted)
    const validColors = sources.linkButtonColors.filter(c => !isNeutralColor(c));
    console.log(`[selectAccentColor] Found ${validColors.length} non-neutral link/button colors`);

    if (validColors.length > 0) {
      const topColor = validColors[0];
      try {
        const [, s] = chroma(topColor).hsl();
        const saturation = isNaN(s) ? 0 : s;
        console.log(`[selectAccentColor] ✓ Using link/button color: ${topColor}, saturation: ${saturation.toFixed(2)}`);
        return {
          color: topColor,
          source: "linkButton",
          isHighConfidence: saturation > 0.3,
        };
      } catch {
        console.log(`[selectAccentColor] ✓ Using link/button color: ${topColor} (saturation calc failed)`);
        return {
          color: topColor,
          source: "linkButton",
          isHighConfidence: false,
        };
      }
    }
  }

  // Step 4: No valid color found
  console.log("[selectAccentColor] ✗ No valid accent color found");
  return {
    color: null,
    source: "none",
    isHighConfidence: false,
  };
}

/**
 * Generate a portal color scheme
 * Uses new sidebar color logic based on nav/header background
 */
export function generateColorScheme(
  navHeaderBackground: string | null,
  accentColor: string | null
): PortalColorScheme {
  // Select sidebar colors using new logic
  const sidebarResult = selectSidebarColors({
    navHeaderBackground,
    accentColor,
  });

  // Use the accent color, or fall back to default
  const accent = accentColor || DEFAULT_COLORS.accent;

  return {
    sidebarBackground: sidebarResult.sidebarBackground,
    sidebarText: sidebarResult.sidebarText,
    accent,
  };
}
