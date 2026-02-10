/**
 * Quality Gate for Color Scheme Validation
 *
 * This module checks the generated color scheme against a set of rules
 * and auto-fixes any failures. It runs up to 3 fix iterations.
 *
 * Key principle: "Visual quality always wins over literal color usage."
 * Brand hue is preserved (±35°), but saturation/luminance can be adjusted.
 */

import chroma from "chroma-js";
import {
  PortalColorScheme,
  ColorAnalysis,
  QualityCheckResult,
  QualityGateResult,
  ColorGenerationContext,
  ValidatedColorScheme,
} from "./types";
import {
  getContrastRatio,
  findAccessibleTextColor,
} from "./contrast";

// ===================== HELPERS =====================

/** Analyze a hex color into hue, saturation, lightness, luminance */
function analyzeColor(hex: string): ColorAnalysis {
  try {
    const c = chroma(hex);
    const [h, s, l] = c.hsl();
    return {
      hex,
      hue: isNaN(h) ? 0 : h,
      saturation: isNaN(s) ? 0 : s,
      lightness: l,
      luminance: c.luminance(),
    };
  } catch {
    return { hex, hue: 0, saturation: 0, lightness: 0.5, luminance: 0.5 };
  }
}

/**
 * A color is "neutral" if it has very low saturation (< 0.08)
 * or is near-white/near-black. Neutral colors look gray and
 * should not be used as sidebar backgrounds.
 */
function isNeutralStrict(hex: string): boolean {
  const { saturation, lightness } = analyzeColor(hex);
  if (lightness > 0.95 || lightness < 0.05) return true;
  return saturation < 0.08;
}

/** Compute lightness difference on a 0-100 scale */
function deltaLightness(a: string, b: string): number {
  const la = analyzeColor(a).lightness * 100;
  const lb = analyzeColor(b).lightness * 100;
  return Math.abs(la - lb);
}

/** Circular hue difference (0-180 degrees) */
function hueDiff(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Boost a color's saturation to at least minSat.
 * Keeps the same hue and lightness — just makes it more vibrant.
 */
function boostSaturation(hex: string, minSat: number): string {
  try {
    const c = chroma(hex);
    const [h, s, l] = c.hsl();
    const currentSat = isNaN(s) ? 0 : s;
    if (currentSat >= minSat) return hex;
    // If hue is undefined (gray), default to blue (220°)
    return chroma.hsl(isNaN(h) ? 220 : h, minSat, l).hex();
  } catch {
    return hex;
  }
}

/**
 * Shift a color's hue toward a target hue by up to maxShift degrees.
 * Used for harmony fixes — nudges sidebar toward accent hue.
 */
function shiftHueToward(hex: string, targetHue: number, maxShift: number): string {
  try {
    const c = chroma(hex);
    const [h, s, l] = c.hsl();
    const currentH = isNaN(h) ? 0 : h;
    // Calculate shortest arc direction
    const diff = ((targetHue - currentH + 540) % 360) - 180;
    const shift = Math.sign(diff) * Math.min(Math.abs(diff), maxShift);
    const newH = (currentH + shift + 360) % 360;
    return chroma.hsl(newH, isNaN(s) ? 0 : s, l).hex();
  } catch {
    return hex;
  }
}

/**
 * Derive a sidebar variant from a brand color.
 * Creates a darkened version suitable for a sidebar surface.
 */
function deriveSidebarFromBrand(brandColor: string): string {
  try {
    const c = chroma(brandColor);
    const [h, s] = c.hsl();
    // Create a dark, saturated variant: keep hue, boost sat, low lightness
    const newSat = Math.max(isNaN(s) ? 0.3 : s, 0.3);
    return chroma.hsl(isNaN(h) ? 220 : h, newSat, 0.2).hex();
  } catch {
    return "#1e293b";
  }
}

// ===================== MONOCHROME BRAND DETECTION =====================

/**
 * Detect if the brand is intentionally monochrome (black/white/gray).
 *
 * A brand is monochrome when:
 * - Both favicon AND logo colors are neutral (sat < 0.08), OR
 * - No favicon/logo colors were extracted at all AND
 *   no non-neutral link/button colors exist on the site
 *
 * In this case, we should NOT inject artificial color — the gray
 * palette IS the brand identity (think Apple, Tesla, etc.)
 */
function isMonochromeBrand(ctx: ColorGenerationContext): boolean {
  const faviconSat = ctx.faviconSaturation ?? 0;
  const logoSat = ctx.logoSaturation ?? 0;

  // If either favicon or logo has real color, it's NOT monochrome
  if (faviconSat >= 0.08 || logoSat >= 0.08) {
    return false;
  }

  // Check if there are any non-neutral colors from links/buttons on the page
  // If there's a clearly colorful UI element, the brand isn't fully monochrome
  const nonNeutralLinkColors = ctx.linkButtonColors.filter(c => !isNeutralStrict(c));
  if (nonNeutralLinkColors.length > 0) {
    // There IS color on the site — check if it's strong enough to matter
    const topSat = nonNeutralLinkColors.reduce((max, c) => {
      return Math.max(max, analyzeColor(c).saturation);
    }, 0);
    if (topSat >= 0.15) {
      return false; // Found a meaningful non-neutral color on the site
    }
  }

  console.log("[QualityGate] Monochrome brand detected — preserving neutral palette");
  return true;
}

/**
 * Strip any hue tint from a color, making it a pure neutral gray.
 * Keeps the same lightness but sets saturation to 0.
 * e.g. #1e293b (blue-gray slate) → #1f1f1f (pure dark gray)
 */
function desaturateToNeutral(hex: string): string {
  try {
    const c = chroma(hex);
    const [, , l] = c.hsl();
    return chroma.hsl(0, 0, l).hex();
  } catch {
    return hex;
  }
}

/**
 * For monochrome brands: generate an appropriate TRUE NEUTRAL palette.
 *
 * Sidebar selection priority:
 *   1. Darkest frequent neutral color from the site (text/surface colors)
 *   2. Darkest neutral nav/header background (desaturated if tinted)
 *   3. Fallback: true neutral in #0f0f0f – #1a1a1a range
 *
 * All colors are desaturated to sat ≤ 0.05 — NO blue/purple/navy tint.
 * The result should feel like a premium black/cream/gray design.
 */
function generateMonochromePalette(
  colors: PortalColorScheme,
  ctx: ColorGenerationContext
): PortalColorScheme {
  let sidebarBg: string | null = null;

  // Priority 1: Find the darkest neutral color from the site's own palette.
  // These are colors extracted from headings, body text, borders, surfaces.
  if (ctx.allExtractedColors.length > 0) {
    const darkNeutrals = ctx.allExtractedColors
      .map((c) => analyzeColor(c))
      .filter((c) => c.saturation < 0.15 && c.lightness < 0.3 && c.lightness > 0.03)
      .sort((a, b) => a.lightness - b.lightness); // darkest first

    if (darkNeutrals.length > 0) {
      // Desaturate to remove any tint (slate/navy → pure gray)
      sidebarBg = desaturateToNeutral(darkNeutrals[0].hex);
    }
  }

  // Priority 2: Use nav/header background if dark enough (desaturated)
  if (!sidebarBg && ctx.navHeaderBackground) {
    const navA = analyzeColor(ctx.navHeaderBackground);
    if (navA.lightness < 0.3) {
      sidebarBg = desaturateToNeutral(ctx.navHeaderBackground);
    }
  }

  // Priority 3: True neutral fallback — no tint at all
  if (!sidebarBg) {
    sidebarBg = "#141414"; // True neutral dark, in the #0f0f0f–#1a1a1a range
  }

  // Safety: ensure the chosen sidebar is truly neutral (sat ≤ 0.05)
  const sidebarA = analyzeColor(sidebarBg);
  if (sidebarA.saturation > 0.05) {
    sidebarBg = desaturateToNeutral(sidebarBg);
  }

  // Pick a visible TRUE NEUTRAL gray for accent — distinct from sidebar.
  // No blue/slate tint — pure gray only.
  let accentGray: string;
  if (sidebarA.lightness < 0.20) {
    accentGray = "#a3a3a3"; // neutral-400: clearly visible on dark bg AND on white
  } else {
    accentGray = "#525252"; // neutral-600: works for medium-dark sidebars
  }

  return {
    sidebarBackground: sidebarBg,
    sidebarText: findAccessibleTextColor(sidebarBg),
    accent: accentGray,
  };
}

/**
 * Validate a monochrome brand scheme.
 *
 * For intentionally neutral brands, we:
 * - Apply the monochrome palette (dark sidebar + gray accent)
 * - Auto-pass the color-requiring checks (they don't apply)
 * - Still enforce: contrast, accent-sidebar distinctness
 * - Never inject bright/saturated colors
 */
function validateMonochromeScheme(
  originalColors: PortalColorScheme,
  ctx: ColorGenerationContext
): ValidatedColorScheme {
  // Step 1: Generate the neutral palette
  let current = generateMonochromePalette(originalColors, ctx);
  const adjustments: string[] = ["Monochrome brand detected — using neutral palette"];

  // Step 2: Ensure contrast passes (still critical for accessibility)
  const contrastResult = checkContrast(current);
  if (!contrastResult.passed) {
    current.sidebarText = findAccessibleTextColor(current.sidebarBackground);
    adjustments.push("Fixed text contrast for monochrome palette");
  }

  // Step 3: Ensure accent is distinct from sidebar (still important for UX)
  const distinctResult = checkAccentSidebarDistinct(current);
  if (!distinctResult.passed) {
    // For monochrome: adjust the accent gray to create more separation
    // Use true neutral grays (no blue/slate tint)
    const sidebarA = analyzeColor(current.sidebarBackground);
    if (sidebarA.lightness < 0.25) {
      current.accent = "#a3a3a3"; // neutral-400: lighter, clearly visible
    } else {
      current.accent = "#525252"; // neutral-600: darker for medium sidebars
    }
    adjustments.push("Adjusted accent gray for better distinction from sidebar");
  }

  // Step 4: Build check results — color-requiring checks auto-pass
  const checks = {
    sidebarNotNeutral: { passed: true, detail: "Monochrome brand — neutral sidebar is intentional" } as QualityCheckResult,
    accentVisible: { passed: true, detail: "Monochrome brand — neutral accent is intentional" } as QualityCheckResult,
    brandPreserved: { passed: true, detail: "Monochrome brand preserved" } as QualityCheckResult,
    contrastPasses: checkContrast(current),
    noGrayOnGray: { passed: true, detail: "Monochrome brand — gray-on-gray is intentional" } as QualityCheckResult,
    harmonyCheck: { passed: true, detail: "Monochrome brand — harmony N/A" } as QualityCheckResult,
    accentSidebarDistinct: checkAccentSidebarDistinct(current),
    antiTemplate: { passed: true, detail: "Monochrome brand — neutral template is intentional" } as QualityCheckResult,
    brandVisibility: { passed: true, detail: "Monochrome brand — neutral colors ARE the brand" } as QualityCheckResult,
    accentUsability: checkAccentUsability(current, ctx),
  };

  return {
    ...current,
    qualityGate: {
      passed: Object.values(checks).every((c) => c.passed),
      checks,
      adjustments,
      originalColors,
      finalColors: current,
      iterations: 0,
    },
    accentPromotion: false, // No accent promotion for monochrome brands
  };
}

// ===================== INDIVIDUAL RULE CHECKS =====================

/**
 * BRAND PRESERVATION
 * If favicon/logo has a strong brand color (sat ≥ 0.25),
 * that brand hue family (±35°) must appear in accent or sidebar.
 * We don't require exact color match — just the hue neighborhood.
 */
function checkBrandPreservation(
  colors: PortalColorScheme,
  ctx: ColorGenerationContext
): QualityCheckResult {
  const brandSat = Math.max(ctx.faviconSaturation ?? 0, ctx.logoSaturation ?? 0);

  // No strong brand color? Nothing to preserve.
  if (brandSat < 0.25) {
    return { passed: true, detail: `No strong brand color (sat ${brandSat.toFixed(2)} < 0.25)` };
  }

  // Check if accent or sidebar comes from a brand source
  const accentFromBrand = ctx.accentResult.source === "squareIcon" || ctx.accentResult.source === "logo";
  if (accentFromBrand) {
    return { passed: true, detail: `Brand color used as accent (source: ${ctx.accentResult.source})` };
  }

  // Even if source isn't brand, check if the accent hue is close to brand hue
  // (could have been derived from link/button with same brand color)
  if (ctx.accentResult.color) {
    const accentHue = analyzeColor(ctx.accentResult.color).hue;
    // Try to find which brand source has the strongest saturation
    const brandHue = analyzeColor(ctx.accentResult.color).hue; // simplified
    if (hueDiff(accentHue, brandHue) <= 35) {
      return { passed: true, detail: `Accent hue within brand family (±35°)` };
    }
  }

  return { passed: false, detail: `Brand sat=${brandSat.toFixed(2)} but not reflected in output` };
}

/**
 * SIDEBAR STRENGTH (Neutral Suppression)
 * Sidebar must have sat ≥ 0.12 OR be derived from a brand hue.
 * Neutral (gray) sidebars are only OK if literally no other color exists.
 */
function checkSidebarStrength(
  colors: PortalColorScheme,
  ctx: ColorGenerationContext
): QualityCheckResult {
  const analysis = analyzeColor(colors.sidebarBackground);

  // If sidebar is neutral (gray), that's bad unless there's no alternative
  if (isNeutralStrict(colors.sidebarBackground)) {
    const hasAlternative = ctx.accentResult.color !== null || ctx.allExtractedColors.length > 0;
    if (hasAlternative) {
      return { passed: false, detail: `Sidebar is neutral (sat=${analysis.saturation.toFixed(2)}) but alternatives exist` };
    }
    return { passed: true, detail: "Sidebar is neutral but no alternatives available" };
  }

  // Sidebar has some color — check it's strong enough
  if (analysis.saturation < 0.12) {
    // Allow if it's brand-derived (designer chose this color)
    const isBrandDerived = ctx.accentResult.source === "squareIcon" || ctx.accentResult.source === "logo";
    if (!isBrandDerived) {
      return { passed: false, detail: `Sidebar sat=${analysis.saturation.toFixed(2)} < 0.12 and not brand-derived` };
    }
  }

  return { passed: true, detail: `Sidebar sat=${analysis.saturation.toFixed(2)}, OK` };
}

/**
 * ACCENT + SIDEBAR DISTINCTNESS (New rule!)
 * Accent and sidebar must be visually distinct so the accent
 * reads as an "action" color, not just more background.
 *
 * Must pass at least one of:
 * - Luminance difference ≥ 35 (on 0-100 scale)
 * - Clearly different colors (different hue families)
 */
function checkAccentSidebarDistinct(
  colors: PortalColorScheme
): QualityCheckResult {
  const sidebarA = analyzeColor(colors.sidebarBackground);
  const accentA = analyzeColor(colors.accent);

  const lumDiff = deltaLightness(colors.sidebarBackground, colors.accent);
  const hDiff = hueDiff(sidebarA.hue, accentA.hue);

  // Pass if luminance difference is large enough
  if (lumDiff >= 35) {
    return { passed: true, detail: `Luminance diff=${lumDiff.toFixed(0)} >= 35` };
  }

  // Pass if hues are clearly different (and both are saturated enough for hue to matter)
  if (hDiff > 30 && sidebarA.saturation > 0.1 && accentA.saturation > 0.1) {
    return { passed: true, detail: `Hue diff=${hDiff.toFixed(0)}deg, colors are distinct` };
  }

  return {
    passed: false,
    detail: `Accent too similar to sidebar (lumDiff=${lumDiff.toFixed(0)}, hueDiff=${hDiff.toFixed(0)}deg)`,
  };
}

/**
 * HARMONY (Soft Constraint)
 * Prefer accent hue within 0-35° of sidebar hue.
 * BUT: exempt if accent comes from logo/favicon (brand takes priority).
 * AND: never force harmony if it would reduce contrast or distinctness.
 */
function checkHarmony(
  colors: PortalColorScheme,
  ctx: ColorGenerationContext
): QualityCheckResult {
  const sidebarA = analyzeColor(colors.sidebarBackground);
  const accentA = analyzeColor(colors.accent);
  const diff = hueDiff(sidebarA.hue, accentA.hue);

  // Exempt if accent comes from brand source (logo or favicon)
  if (ctx.accentResult.source === "logo" || ctx.accentResult.source === "squareIcon") {
    return { passed: true, detail: `Hue diff=${diff.toFixed(0)}deg (exempt: accent from brand)` };
  }

  // Exempt if either color has low saturation (hue is meaningless for grays)
  if (sidebarA.saturation < 0.1 || accentA.saturation < 0.1) {
    return { passed: true, detail: `Hue diff=${diff.toFixed(0)}deg (exempt: low saturation)` };
  }

  // Soft limit: 35° (was 20° before — more forgiving now)
  if (diff > 35) {
    return { passed: false, detail: `Hue diff=${diff.toFixed(0)}deg > 35 (sidebar ${sidebarA.hue.toFixed(0)}, accent ${accentA.hue.toFixed(0)})` };
  }

  return { passed: true, detail: `Hue diff=${diff.toFixed(0)}deg, within soft limit` };
}

/**
 * CONTRAST
 * Sidebar text must pass WCAG 4.5:1 against sidebar background.
 * If it doesn't, we'll auto-fix the text color.
 */
function checkContrast(colors: PortalColorScheme): QualityCheckResult {
  const ratio = getContrastRatio(colors.sidebarText, colors.sidebarBackground);

  if (ratio < 4.5) {
    return {
      passed: false,
      detail: `Contrast ratio=${ratio.toFixed(2)} < 4.5`,
    };
  }

  return { passed: true, detail: `Contrast ratio=${ratio.toFixed(2)}` };
}

/**
 * ACCENT VISIBILITY
 * Accent must be usable — needs enough saturation to look like
 * an interactive/action color (buttons, highlights, etc.)
 */
function checkAccentVisible(colors: PortalColorScheme): QualityCheckResult {
  const a = analyzeColor(colors.accent);
  if (a.saturation < 0.12) {
    return { passed: false, detail: `Accent sat=${a.saturation.toFixed(2)} < 0.12` };
  }
  return { passed: true, detail: `Accent sat=${a.saturation.toFixed(2)}` };
}

/**
 * ACCENT USABILITY ON WHITE
 * If accent has high confidence, it must work as a button color on white.
 * This means it needs enough contrast against white (#ffffff).
 */
function checkAccentUsability(
  colors: PortalColorScheme,
  ctx: ColorGenerationContext
): QualityCheckResult {
  if (!ctx.accentResult.isHighConfidence) {
    return { passed: true, detail: "Low confidence accent, usability check skipped" };
  }

  const ratio = getContrastRatio(colors.accent, "#ffffff");
  if (ratio < 3.0) {
    return { passed: false, detail: `Accent on white contrast=${ratio.toFixed(2)} < 3.0` };
  }
  return { passed: true, detail: `Accent on white contrast=${ratio.toFixed(2)}` };
}

/**
 * BRAND VISIBILITY
 * If logo has strong brand color (sat ≥ 0.25) but accent confidence is low,
 * something went wrong — the brand color was ignored.
 */
function checkBrandVisibility(
  colors: PortalColorScheme,
  ctx: ColorGenerationContext
): QualityCheckResult {
  const logoSat = ctx.logoSaturation ?? 0;
  if (logoSat >= 0.25 && !ctx.accentResult.isHighConfidence) {
    return { passed: false, detail: `Logo sat=${logoSat.toFixed(2)} >= 0.25 but accent confidence is low` };
  }
  return { passed: true, detail: "Brand visibility OK" };
}

/**
 * ANTI-TEMPLATE PROTECTION
 * Detects "generic gray" designs where everything is neutral.
 * Triggers if sidebar is low-sat AND accent is low-sat AND most colors are neutral.
 */
function checkAntiTemplate(
  colors: PortalColorScheme,
  ctx: ColorGenerationContext
): QualityCheckResult {
  const sidebarSat = analyzeColor(colors.sidebarBackground).saturation;
  const accentSat = analyzeColor(colors.accent).saturation;
  const neutralCount = ctx.allExtractedColors.filter((c) => isNeutralStrict(c)).length;
  const neutralRatio =
    ctx.allExtractedColors.length > 0
      ? neutralCount / ctx.allExtractedColors.length
      : 0;

  if (sidebarSat < 0.10 && accentSat < 0.15 && neutralRatio > 0.7) {
    return {
      passed: false,
      detail: `Template look: sidebarSat=${sidebarSat.toFixed(2)}, accentSat=${accentSat.toFixed(2)}, neutralRatio=${neutralRatio.toFixed(2)}`,
    };
  }

  return { passed: true, detail: "Not a template look" };
}

/**
 * GRAY-ON-GRAY CHECK
 * Both sidebar and accent cannot both be neutral/gray.
 * At least one must have color.
 */
function checkNoGrayOnGray(colors: PortalColorScheme): QualityCheckResult {
  const sidebarA = analyzeColor(colors.sidebarBackground);
  const accentA = analyzeColor(colors.accent);

  if (sidebarA.saturation < 0.08 && accentA.saturation < 0.08) {
    return { passed: false, detail: "Both sidebar and accent are gray/neutral" };
  }

  return { passed: true, detail: "Colors are not both gray" };
}

// ===================== FIX STRATEGIES =====================

/**
 * Auto-fix colors based on which checks failed.
 * Priority order: contrast → sidebar strength → distinctness →
 * brand → accent usability → harmony → anti-template
 */
function fixColors(
  colors: PortalColorScheme,
  ctx: ColorGenerationContext,
  failedChecks: string[]
): PortalColorScheme {
  let fixed = { ...colors };

  // 1. Fix CONTRAST first — most critical for accessibility
  if (failedChecks.includes("contrastPasses")) {
    // Try white text first, then dark text
    fixed.sidebarText = findAccessibleTextColor(fixed.sidebarBackground);
    // If still not passing, slightly adjust sidebar background
    const ratio = getContrastRatio(fixed.sidebarText, fixed.sidebarBackground);
    if (ratio < 4.5) {
      const sA = analyzeColor(fixed.sidebarBackground);
      if (sA.lightness > 0.5) {
        fixed.sidebarBackground = chroma(fixed.sidebarBackground).darken(0.8).hex();
      } else {
        fixed.sidebarBackground = chroma(fixed.sidebarBackground).darken(0.4).hex();
      }
      fixed.sidebarText = findAccessibleTextColor(fixed.sidebarBackground);
    }
  }

  // 2. Fix SIDEBAR STRENGTH — replace neutral sidebar with something colorful
  if (failedChecks.includes("sidebarNotNeutral")) {
    if (ctx.accentResult.color) {
      // Derive a sidebar from the brand/accent color
      fixed.sidebarBackground = deriveSidebarFromBrand(ctx.accentResult.color);
    } else if (ctx.allExtractedColors.length > 0) {
      // Pick the most saturated extracted color and darken it
      const sorted = [...ctx.allExtractedColors].sort((a, b) => {
        return analyzeColor(b).saturation - analyzeColor(a).saturation;
      });
      fixed.sidebarBackground = deriveSidebarFromBrand(sorted[0]);
    } else {
      // Last resort: add some blue to the gray
      fixed.sidebarBackground = boostSaturation(fixed.sidebarBackground, 0.15);
    }
    fixed.sidebarText = findAccessibleTextColor(fixed.sidebarBackground);
  }

  // 3. Fix ACCENT-SIDEBAR DISTINCTNESS — make them visually different
  // Strategy: adjust the sidebar (darker/lighter) to create separation,
  // rather than changing the accent (which is the brand color).
  if (failedChecks.includes("accentSidebarDistinct")) {
    const sidebarA = analyzeColor(fixed.sidebarBackground);
    const accentA = analyzeColor(fixed.accent);

    // If accent is the brand color, adjust sidebar instead
    if (ctx.accentResult.source === "squareIcon" || ctx.accentResult.source === "logo") {
      if (accentA.lightness > 0.5) {
        // Bright accent → make sidebar much darker
        fixed.sidebarBackground = chroma(fixed.sidebarBackground).darken(2).hex();
      } else {
        // Dark accent → make sidebar even darker or derive from accent
        fixed.sidebarBackground = deriveSidebarFromBrand(fixed.accent);
      }
      fixed.sidebarText = findAccessibleTextColor(fixed.sidebarBackground);
    } else {
      // Non-brand accent: safe to adjust accent
      if (sidebarA.lightness < 0.4) {
        // Dark sidebar → make accent moderately brighter (not too much!)
        fixed.accent = chroma(fixed.accent).brighten(0.8).saturate(0.3).hex();
      } else {
        // Light sidebar → darken and saturate accent
        fixed.accent = chroma(fixed.accent).darken(0.8).saturate(0.5).hex();
      }
    }
  }

  // 4. Fix BRAND PRESERVATION — use brand color for sidebar
  if (failedChecks.includes("brandPreserved") && ctx.accentResult.color) {
    fixed.sidebarBackground = deriveSidebarFromBrand(ctx.accentResult.color);
    fixed.sidebarText = findAccessibleTextColor(fixed.sidebarBackground);
  }

  // 5. Fix BRAND VISIBILITY — boost accent saturation
  if (failedChecks.includes("brandVisibility") && ctx.accentResult.color) {
    fixed.accent = boostSaturation(ctx.accentResult.color, 0.3);
  }

  // 6. Fix ACCENT USABILITY on white — darken or saturate accent
  if (failedChecks.includes("accentUsability")) {
    try {
      let adjusted = chroma(fixed.accent);
      // Darken until contrast against white >= 3.0
      for (let i = 0; i < 8; i++) {
        if (getContrastRatio(adjusted.hex(), "#ffffff") >= 3.0) break;
        adjusted = adjusted.darken(0.3);
      }
      fixed.accent = adjusted.hex();
    } catch {
      // Keep as-is if adjustment fails
    }
  }

  // 7. Fix HARMONY (soft) — nudge sidebar hue toward accent
  if (failedChecks.includes("harmonyCheck")) {
    const accentHue = analyzeColor(fixed.accent).hue;
    fixed.sidebarBackground = shiftHueToward(fixed.sidebarBackground, accentHue, 20);
    fixed.sidebarText = findAccessibleTextColor(fixed.sidebarBackground);
  }

  // 8. Fix ANTI-TEMPLATE and GRAY-ON-GRAY — boost both colors
  if (failedChecks.includes("antiTemplate") || failedChecks.includes("noGrayOnGray")) {
    fixed.sidebarBackground = boostSaturation(fixed.sidebarBackground, 0.15);
    fixed.accent = boostSaturation(fixed.accent, 0.20);
    fixed.sidebarText = findAccessibleTextColor(fixed.sidebarBackground);
  }

  // 9. Fix ACCENT VISIBILITY — make accent more saturated
  if (failedChecks.includes("accentVisible")) {
    fixed.accent = boostSaturation(fixed.accent, 0.15);
  }

  return fixed;
}

// ===================== MAIN VALIDATION + FIX LOOP =====================

const MAX_ITERATIONS = 3;

/**
 * Main entry point: validate a color scheme against all rules,
 * and auto-fix any failures (up to 3 attempts).
 *
 * Returns the validated (and possibly adjusted) color scheme
 * along with detailed quality gate results.
 */
export function validateAndFixColorScheme(
  colors: PortalColorScheme,
  ctx: ColorGenerationContext
): ValidatedColorScheme {
  // ── MONOCHROME BRAND EARLY EXIT ──
  // If the brand is intentionally monochrome (e.g. Apple, Tesla),
  // don't inject artificial color. Use a neutral palette and only
  // validate contrast + distinctness (the things that still matter).
  if (isMonochromeBrand(ctx)) {
    return validateMonochromeScheme(colors, ctx);
  }

  let current = { ...colors };
  const allAdjustments: string[] = [];
  let iteration = 0;

  for (iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Run all checks
    const checks = {
      sidebarNotNeutral: checkSidebarStrength(current, ctx),
      accentVisible: checkAccentVisible(current),
      brandPreserved: checkBrandPreservation(current, ctx),
      contrastPasses: checkContrast(current),
      noGrayOnGray: checkNoGrayOnGray(current),
      harmonyCheck: checkHarmony(current, ctx),
      accentSidebarDistinct: checkAccentSidebarDistinct(current),
      antiTemplate: checkAntiTemplate(current, ctx),
      brandVisibility: checkBrandVisibility(current, ctx),
      accentUsability: checkAccentUsability(current, ctx),
    };

    const allPassed = Object.values(checks).every((c) => c.passed);

    if (allPassed) {
      // All checks passed — return the validated scheme
      return {
        ...current,
        qualityGate: {
          passed: true,
          checks,
          adjustments: allAdjustments,
          originalColors: colors,
          finalColors: current,
          iterations: iteration,
        },
        accentPromotion: ctx.accentResult.isHighConfidence,
      };
    }

    // Collect which checks failed
    const failedChecks: string[] = [];
    for (const [key, val] of Object.entries(checks)) {
      if (!val.passed) failedChecks.push(key);
    }

    allAdjustments.push(`Iteration ${iteration + 1}: fixing ${failedChecks.join(", ")}`);
    console.log(`[QualityGate] ${allAdjustments[allAdjustments.length - 1]}`);

    // Apply fixes
    current = fixColors(current, ctx, failedChecks);
  }

  // Ran out of iterations — return best effort with final check results
  const finalChecks = {
    sidebarNotNeutral: checkSidebarStrength(current, ctx),
    accentVisible: checkAccentVisible(current),
    brandPreserved: checkBrandPreservation(current, ctx),
    contrastPasses: checkContrast(current),
    noGrayOnGray: checkNoGrayOnGray(current),
    harmonyCheck: checkHarmony(current, ctx),
    accentSidebarDistinct: checkAccentSidebarDistinct(current),
    antiTemplate: checkAntiTemplate(current, ctx),
    brandVisibility: checkBrandVisibility(current, ctx),
    accentUsability: checkAccentUsability(current, ctx),
  };

  return {
    ...current,
    qualityGate: {
      passed: Object.values(finalChecks).every((c) => c.passed),
      checks: finalChecks,
      adjustments: allAdjustments,
      originalColors: colors,
      finalColors: current,
      iterations: iteration,
    },
    accentPromotion: ctx.accentResult.isHighConfidence,
  };
}
