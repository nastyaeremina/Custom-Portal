import chroma from "chroma-js";

/**
 * Calculate WCAG contrast ratio between two colors
 */
export function getContrastRatio(foreground: string, background: string): number {
  try {
    const fgLum = chroma(foreground).luminance();
    const bgLum = chroma(background).luminance();

    const lighter = Math.max(fgLum, bgLum);
    const darker = Math.min(fgLum, bgLum);

    return (lighter + 0.05) / (darker + 0.05);
  } catch {
    return 1;
  }
}

/**
 * Check if contrast ratio meets WCAG AA standard (4.5:1 for normal text)
 */
export function meetsContrastRatio(
  foreground: string,
  background: string,
  minRatio: number = 4.5
): boolean {
  return getContrastRatio(foreground, background) >= minRatio;
}

/**
 * Find an accessible text color for a given background
 */
export function findAccessibleTextColor(backgroundColor: string): string {
  try {
    const bgColor = chroma(backgroundColor);
    const luminance = bgColor.luminance();

    // Try white first
    if (meetsContrastRatio("#ffffff", backgroundColor)) {
      return "#ffffff";
    }

    // Try black
    if (meetsContrastRatio("#000000", backgroundColor)) {
      return "#000000";
    }

    // Pick based on luminance
    return luminance > 0.5 ? "#1a1a1a" : "#f5f5f5";
  } catch {
    return "#000000";
  }
}

/**
 * Adjust a color to meet contrast requirements against a background
 */
export function adjustForContrast(
  color: string,
  background: string,
  minRatio: number = 3
): string {
  try {
    let adjustedColor = chroma(color);
    const bgLuminance = chroma(background).luminance();

    // Determine direction to adjust (darken or lighten)
    const shouldDarken = bgLuminance > 0.5;

    for (let i = 0; i < 10; i++) {
      if (meetsContrastRatio(adjustedColor.hex(), background, minRatio)) {
        return adjustedColor.hex();
      }

      if (shouldDarken) {
        adjustedColor = adjustedColor.darken(0.3);
      } else {
        adjustedColor = adjustedColor.brighten(0.3);
      }
    }

    // Fallback
    return shouldDarken ? "#000000" : "#ffffff";
  } catch {
    return color;
  }
}
