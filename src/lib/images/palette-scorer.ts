/**
 * Palette Diversity Scorer
 *
 * Analyzes the gradient color stops to determine whether the brand's
 * palette is diverse enough for a gradient to look visually rich,
 * or whether a curated library photo would be a better choice.
 *
 * High diversity (Stripe-like multi-color) → gradient
 * Low diversity  (single-navy wash)        → library photo
 */

// ── Color helpers (self-contained, no external deps) ─────────────

/** Parse "#rrggbb" → { r, g, b } (0-255) */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  };
}

/** RGB → HSL (h: 0-360, s: 0-1, l: 0-1) */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: h * 360, s, l };
}

/** Relative luminance (0-1) for contrast calculations */
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// ── Scorer ───────────────────────────────────────────────────────

const DIVERSITY_THRESHOLD = 0.45;

export interface DiversityResult {
  /** 0.0 (flat) to 1.0 (rich) */
  score: number;
  /** true → use gradient, false → use library photo */
  useGradient: boolean;
  /** Human-readable debug explanation */
  reason: string;
}

/**
 * Score how diverse/rich a set of gradient stops is.
 *
 * @param stops     - Hex color stops from `computeGradientDebug().stops`
 * @param usedPreset - Whether `normalizeStops` fell back to a preset palette
 */
export function scorePaletteDiversity(
  stops: string[],
  usedPreset: boolean
): DiversityResult {
  const parsed = stops
    .map((hex) => {
      const rgb = hexToRgb(hex);
      if (!rgb) return null;
      const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
      const lum = luminance(rgb.r, rgb.g, rgb.b);
      return { hex, ...rgb, ...hsl, lum };
    })
    .filter(Boolean) as Array<{
      hex: string; r: number; g: number; b: number;
      h: number; s: number; l: number; lum: number;
    }>;

  if (parsed.length === 0) {
    return { score: 0, useGradient: false, reason: "no valid color stops" };
  }

  // ── Sub-score 1: Hue spread (0-1) ─────────────────────────────
  // Max pairwise circular hue difference, normalized to 120° = 1.0
  // Ignore hue if all stops are near-gray (saturation < 0.10)
  const allGray = parsed.every((c) => c.s < 0.10);
  let hueScore = 0;
  if (!allGray && parsed.length >= 2) {
    let maxHueDiff = 0;
    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        // Only compare hues of colors with meaningful saturation
        if (parsed[i].s < 0.10 || parsed[j].s < 0.10) continue;
        const diff = Math.abs(parsed[i].h - parsed[j].h);
        const circularDiff = Math.min(diff, 360 - diff);
        maxHueDiff = Math.max(maxHueDiff, circularDiff);
      }
    }
    hueScore = Math.min(maxHueDiff / 120, 1.0);
  }

  // ── Sub-score 2: Luminance range (0-1) ─────────────────────────
  // Difference between lightest and darkest, normalized to 0.45 = 1.0
  const lums = parsed.map((c) => c.lum);
  const lumRange = Math.max(...lums) - Math.min(...lums);
  const lumScore = Math.min(lumRange / 0.45, 1.0);

  // ── Sub-score 3: Mean saturation (0-1) ─────────────────────────
  // Average saturation of all stops, normalized to 0.40 = 1.0
  const meanSat = parsed.reduce((sum, c) => sum + c.s, 0) / parsed.length;
  const satScore = Math.min(meanSat / 0.40, 1.0);

  // ── Sub-score 4: Stop count (0-1) ──────────────────────────────
  // More surviving stops = richer gradient
  const countScore = (parsed.length - 1) / 3; // 2→0.33, 3→0.67, 4→1.0

  // ── Preset penalty ─────────────────────────────────────────────
  const presetPenalty = usedPreset ? 0.15 : 0;

  // ── Final score ────────────────────────────────────────────────
  const raw =
    0.30 * hueScore +
    0.30 * lumScore +
    0.20 * satScore +
    0.20 * countScore;

  const score = Math.max(0, Math.round((raw - presetPenalty) * 100) / 100);
  const useGradient = score >= DIVERSITY_THRESHOLD;

  const reason =
    `score=${score.toFixed(2)} (hue=${hueScore.toFixed(2)} lum=${lumScore.toFixed(2)} ` +
    `sat=${satScore.toFixed(2)} count=${countScore.toFixed(2)}` +
    `${usedPreset ? " preset=-0.15" : ""}) → ${useGradient ? "gradient" : "library"}`;

  return { score, useGradient, reason };
}
