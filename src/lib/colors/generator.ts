import chroma from "chroma-js";
import { PortalColorScheme } from "./types";
import { findAccessibleTextColor, adjustForContrast } from "./contrast";
import { filterBrandColors, sortByVibrancy } from "./extractor";

// Default fallback colors
const DEFAULT_COLORS: PortalColorScheme = {
  sidebarBackground: "#1e293b", // Slate 800
  sidebarText: "#ffffff",
  accent: "#3b82f6", // Blue 500
};

/**
 * Generate a portal color scheme from scraped and extracted colors
 */
export function generateColorScheme(
  scrapedColors: string[],
  imageColors: string[]
): PortalColorScheme {
  // Combine all colors
  const allColors = [...new Set([...scrapedColors, ...imageColors])];

  // Filter to brand-suitable colors
  const brandColors = filterBrandColors(allColors);

  // Sort by vibrancy
  const sortedColors = sortByVibrancy(brandColors);

  if (sortedColors.length === 0) {
    return DEFAULT_COLORS;
  }

  // Pick sidebar background (most vibrant, saturated color)
  const sidebarBackground = pickSidebarColor(sortedColors);

  // Calculate accessible text color for sidebar
  const sidebarText = findAccessibleTextColor(sidebarBackground);

  // Pick accent color (should contrast with white)
  const accent = pickAccentColor(sortedColors, sidebarBackground);

  return {
    sidebarBackground,
    sidebarText,
    accent,
  };
}

/**
 * Pick a color suitable for sidebar background
 * Prefers darker or more saturated colors
 */
function pickSidebarColor(colors: string[]): string {
  // First, try to find a color that's dark enough for white text
  const darkColors = colors.filter((c) => {
    try {
      const luminance = chroma(c).luminance();
      return luminance < 0.4;
    } catch {
      return false;
    }
  });

  if (darkColors.length > 0) {
    return darkColors[0];
  }

  // If no dark colors, darken the most vibrant color
  if (colors.length > 0) {
    try {
      return chroma(colors[0]).darken(1.5).hex();
    } catch {
      return DEFAULT_COLORS.sidebarBackground;
    }
  }

  return DEFAULT_COLORS.sidebarBackground;
}

/**
 * Pick an accent color that contrasts well with white
 */
function pickAccentColor(colors: string[], sidebarColor: string): string {
  // Filter colors that contrast well with white (for CTAs)
  const contrastingColors = colors.filter((c) => {
    try {
      // Check contrast with white (min 3:1 for large text/buttons)
      const fgLum = chroma(c).luminance();
      const bgLum = chroma("#ffffff").luminance();
      const ratio = (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
      return ratio >= 3;
    } catch {
      return false;
    }
  });

  // Prefer a color different from sidebar
  const differentFromSidebar = contrastingColors.filter((c) => {
    try {
      return chroma.deltaE(c, sidebarColor) > 20;
    } catch {
      return true;
    }
  });

  if (differentFromSidebar.length > 0) {
    return differentFromSidebar[0];
  }

  if (contrastingColors.length > 0) {
    return contrastingColors[0];
  }

  // Fallback: darken the sidebar color or use default
  try {
    const adjusted = adjustForContrast(sidebarColor, "#ffffff", 3);
    return adjusted;
  } catch {
    return DEFAULT_COLORS.accent;
  }
}
