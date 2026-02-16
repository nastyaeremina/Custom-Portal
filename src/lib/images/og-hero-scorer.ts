import sharp from "sharp";
import { fetchImageBuffer, resizeImage } from "./processor";

// ─── Thresholds ─────────────────────────────────────────────────────────────

/** Reject images whose longer side is below this (avoids blurry 3× upscale). */
const MIN_LONG_SIDE = 400;

/** Reject images whose shorter side is below this (likely a logo, not a photo). */
const MIN_SHORT_SIDE = 300;

/** Reject portrait images: height must be ≤ width × this factor. */
const MAX_PORTRAIT_RATIO = 1.2;

/** Minimum unique quantised colors in a 50×50 thumbnail (rejects solid fills). */
const MIN_UNIQUE_COLORS = 8;

/** Minimum pixel area for a quality cover crop to 1160×1160. */
const MIN_AREA = 150_000; // ~387×387

/** Color quantisation bucket size (matches brand-mark-selector pattern). */
const QUANTIZE_STEP = 16;

/** Thumbnail size for pixel analysis (complexity, edge density, spatial spread). */
const THUMBNAIL_SIZE = 50;

/** Weighted total must be ≥ this to pass. */
const PASS_THRESHOLD = 70;

/** Minimum mean edge strength (0–255 scale). Below this = flat/logo-on-solid. */
const MIN_EDGE_DENSITY = 8;

/** Minimum fraction of 5×5 grid cells with visual detail. Below = concentrated logo/text. */
const MIN_SPREAD_RATIO = 0.40; // 10 of 25 cells

// ─── Score weights (6 sub-scores, sum to 1.0) ──────────────────────────────

const W_RESOLUTION = 0.2;
const W_ASPECT = 0.15;
const W_COMPLEXITY = 0.15;
const W_AREA = 0.1;
const W_EDGE_DENSITY = 0.2;
const W_SPATIAL_SPREAD = 0.2;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface OgHeroScores {
  resolution: number; // 0–100
  aspectRatio: number; // 0–100
  complexity: number; // 0–100
  area: number; // 0–100
  edgeDensity: number; // 0–100  (NEW)
  spatialSpread: number; // 0–100  (NEW)
}

export interface OgHeroScore {
  scores: OgHeroScores;
  total: number;
  passed: boolean;
  reasons: string[];
}

export interface OgHeroEvaluation {
  /** The OG image URL that was evaluated (null if no OG image existed). */
  ogImageUrl: string | null;
  /** Whether the OG image passed all quality gates. */
  passed: boolean;
  /** Processed 1160×1160 data URL (base64 PNG) — null if not passed. */
  processedImageDataUrl: string | null;
  /** Score breakdown for debug output. */
  score: OgHeroScore | null;
}

// ─── Pixel analysis helpers ─────────────────────────────────────────────────

/**
 * Compute edge density from raw RGB pixel data.
 *
 * For each pixel, measure the absolute colour difference from its right and
 * bottom neighbours, average across all channels. Returns the mean edge
 * strength (0–255 scale).
 *
 * Photographs: 15–40+  |  Logo-on-white: 2–6  |  Text banners: 8–14
 */
function computeEdgeDensity(
  data: Buffer,
  w: number,
  h: number,
  channels: number
): number {
  let totalEdge = 0;
  let count = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * channels;
      let edge = 0;
      let edgeN = 0;

      // Horizontal gradient (right neighbour)
      if (x < w - 1) {
        const rIdx = idx + channels;
        edge +=
          Math.abs(data[idx] - data[rIdx]) +
          Math.abs(data[idx + 1] - data[rIdx + 1]) +
          Math.abs(data[idx + 2] - data[rIdx + 2]);
        edgeN += 3;
      }

      // Vertical gradient (bottom neighbour)
      if (y < h - 1) {
        const bIdx = ((y + 1) * w + x) * channels;
        edge +=
          Math.abs(data[idx] - data[bIdx]) +
          Math.abs(data[idx + 1] - data[bIdx + 1]) +
          Math.abs(data[idx + 2] - data[bIdx + 2]);
        edgeN += 3;
      }

      if (edgeN > 0) {
        totalEdge += edge / edgeN;
        count++;
      }
    }
  }

  return count > 0 ? totalEdge / count : 0;
}

/**
 * Compute spatial spread from raw RGB pixel data.
 *
 * Divides the image into a 5×5 grid (25 cells). For each cell, computes the
 * mean colour deviation — if it exceeds a threshold, the cell is "active"
 * (contains visual detail rather than flat background).
 *
 * Returns the fraction of active cells (0–1).
 *
 * Photographs: 0.72–1.0  |  Logo-on-white: 0.12–0.32  |  Text banners: 0.4–0.56
 */
function computeSpatialSpread(
  data: Buffer,
  w: number,
  h: number,
  channels: number
): number {
  const GRID = 5;
  const cellW = Math.floor(w / GRID);
  const cellH = Math.floor(h / GRID);
  const ACTIVITY_THRESHOLD = 10; // mean deviation must exceed this

  let activeCells = 0;

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const startX = gx * cellW;
      const startY = gy * cellH;

      // Compute mean colour of cell
      let sumR = 0, sumG = 0, sumB = 0;
      let pixelCount = 0;

      for (let y = startY; y < startY + cellH && y < h; y++) {
        for (let x = startX; x < startX + cellW && x < w; x++) {
          const idx = (y * w + x) * channels;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
          pixelCount++;
        }
      }

      if (pixelCount === 0) continue;

      const meanR = sumR / pixelCount;
      const meanG = sumG / pixelCount;
      const meanB = sumB / pixelCount;

      // Compute mean absolute deviation from cell mean
      let totalDev = 0;
      for (let y = startY; y < startY + cellH && y < h; y++) {
        for (let x = startX; x < startX + cellW && x < w; x++) {
          const idx = (y * w + x) * channels;
          totalDev +=
            (Math.abs(data[idx] - meanR) +
              Math.abs(data[idx + 1] - meanG) +
              Math.abs(data[idx + 2] - meanB)) /
            3;
        }
      }

      const meanDev = totalDev / pixelCount;
      if (meanDev > ACTIVITY_THRESHOLD) {
        activeCells++;
      }
    }
  }

  return activeCells / (GRID * GRID);
}

// ─── Main evaluator ─────────────────────────────────────────────────────────

/**
 * Evaluate an OG image as a potential login hero.
 *
 * Fetches the image, runs quality gates (resolution, aspect ratio, complexity,
 * edge density, spatial spread, area), and — if all gates pass — processes it
 * to a 1160×1160 cover-crop data URL ready for the login screen.
 *
 * Reuses `fetchImageBuffer` and `resizeImage` from processor.ts.
 * The buffer is fetched once and reused for both analysis and processing.
 */
export async function evaluateOgHero(
  ogImageUrl: string | null
): Promise<OgHeroEvaluation> {
  if (!ogImageUrl) {
    return { ogImageUrl: null, passed: false, processedImageDataUrl: null, score: null };
  }

  const reasons: string[] = [];

  try {
    // ── Fetch ───────────────────────────────────────────────────────
    const buffer = await fetchImageBuffer(ogImageUrl);

    // ── Metadata ────────────────────────────────────────────────────
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const longSide = Math.max(width, height);
    const shortSide = Math.min(width, height);
    const area = width * height;

    // ── Score: resolution ───────────────────────────────────────────
    let resolutionScore: number;
    if (longSide >= 1200) {
      resolutionScore = 100;
    } else if (longSide >= MIN_LONG_SIDE) {
      resolutionScore = 50 + ((longSide - MIN_LONG_SIDE) / (1200 - MIN_LONG_SIDE)) * 50;
    } else {
      resolutionScore = (longSide / MIN_LONG_SIDE) * 50;
      reasons.push(`long side ${longSide}px < ${MIN_LONG_SIDE}px min`);
    }

    // Hard gate: short side too small → likely a logo
    if (shortSide < MIN_SHORT_SIDE) {
      reasons.push(`short side ${shortSide}px < ${MIN_SHORT_SIDE}px (likely logo)`);
      resolutionScore = Math.min(resolutionScore, 20);
    }

    // ── Score: aspect ratio (soft penalty) ─────────────────────────
    // We crop to 1160×1160 (square) with fit: "cover", so images closer
    // to 1:1 crop with minimal loss.  Wide images lose width — scored as
    // a soft penalty since the pixel-analysis gates (edge density, spatial
    // spread) already evaluate the *cropped* content quality.
    let aspectScore: number;
    const isPortrait = height > width * MAX_PORTRAIT_RATIO;
    const landscapeRatio = width > 0 && height > 0 ? width / height : 1;

    if (isPortrait) {
      aspectScore = 0;
      reasons.push(`portrait ${width}×${height} (h > w × ${MAX_PORTRAIT_RATIO})`);
    } else if (landscapeRatio <= 1.2) {
      aspectScore = 100; // nearly square — ideal
    } else if (landscapeRatio <= 1.5) {
      // Mild landscape — moderate crop (~17-33% loss)
      aspectScore = 70 + ((1.5 - landscapeRatio) / 0.3) * 30; // 70–100
    } else if (landscapeRatio <= 2.0) {
      // Standard OG ratio — significant crop (~33-50% loss)
      aspectScore = 30 + ((2.0 - landscapeRatio) / 0.5) * 40; // 30–70
      reasons.push(`wide ${landscapeRatio.toFixed(1)}:1 (${Math.round((1 - 1 / landscapeRatio) * 100)}% crop loss)`);
    } else {
      aspectScore = 0;
      reasons.push(`ultra-wide ${landscapeRatio.toFixed(1)}:1`);
    }

    // ── Pixel analysis (complexity + edge density + spatial spread) ──
    // All three computed from the same 50×50 raw thumbnail.
    let complexityScore: number;
    let uniqueColors: number;
    let edgeDensityScore: number;
    let edgeDensityRaw: number;
    let spatialSpreadScore: number;
    let spreadRatio: number;

    try {
      const { data, info } = await sharp(buffer)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "cover" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const thumbW = info.width;
      const thumbH = info.height;
      const ch = info.channels;

      // ─ Complexity (unique quantised colors) ─
      const colorSet = new Set<string>();
      for (let i = 0; i < data.length; i += ch) {
        const r = Math.round(data[i] / QUANTIZE_STEP) * QUANTIZE_STEP;
        const g = Math.round(data[i + 1] / QUANTIZE_STEP) * QUANTIZE_STEP;
        const b = Math.round(data[i + 2] / QUANTIZE_STEP) * QUANTIZE_STEP;
        colorSet.add(`${r},${g},${b}`);
      }
      uniqueColors = colorSet.size;

      if (uniqueColors >= 30) {
        complexityScore = 100;
      } else if (uniqueColors >= MIN_UNIQUE_COLORS) {
        complexityScore =
          50 + ((uniqueColors - MIN_UNIQUE_COLORS) / (30 - MIN_UNIQUE_COLORS)) * 50;
      } else {
        complexityScore = (uniqueColors / MIN_UNIQUE_COLORS) * 50;
        reasons.push(`only ${uniqueColors} unique colors (min ${MIN_UNIQUE_COLORS})`);
      }

      // ─ Edge density ─
      edgeDensityRaw = computeEdgeDensity(data, thumbW, thumbH, ch);

      if (edgeDensityRaw >= 25) {
        edgeDensityScore = 100;
      } else if (edgeDensityRaw >= 5) {
        edgeDensityScore = ((edgeDensityRaw - 5) / (25 - 5)) * 100;
      } else {
        edgeDensityScore = 0;
      }

      if (edgeDensityRaw < MIN_EDGE_DENSITY) {
        reasons.push(
          `edge density ${edgeDensityRaw.toFixed(1)} < ${MIN_EDGE_DENSITY} (flat/logo-on-solid)`
        );
      }

      // ─ Spatial spread ─
      spreadRatio = computeSpatialSpread(data, thumbW, thumbH, ch);

      if (spreadRatio >= 0.72) {
        spatialSpreadScore = 100;
      } else if (spreadRatio >= 0.2) {
        spatialSpreadScore = ((spreadRatio - 0.2) / (0.72 - 0.2)) * 100;
      } else {
        spatialSpreadScore = 0;
      }

      if (spreadRatio < MIN_SPREAD_RATIO) {
        reasons.push(
          `spread ${(spreadRatio * 100).toFixed(0)}% < ${(MIN_SPREAD_RATIO * 100).toFixed(0)}% (concentrated content)`
        );
      }
    } catch {
      complexityScore = 50;
      uniqueColors = -1;
      edgeDensityScore = 0;
      edgeDensityRaw = 0;
      spatialSpreadScore = 0;
      spreadRatio = 0;
    }

    // ── Score: area ─────────────────────────────────────────────────
    let areaScore: number;
    if (area >= 1_000_000) {
      areaScore = 100;
    } else if (area >= MIN_AREA) {
      areaScore = 50 + ((area - MIN_AREA) / (1_000_000 - MIN_AREA)) * 50;
    } else {
      areaScore = (area / MIN_AREA) * 50;
      reasons.push(`area ${area}px² < ${MIN_AREA}px² min`);
    }

    // ── Weighted total ──────────────────────────────────────────────
    const total = Math.round(
      resolutionScore * W_RESOLUTION +
        aspectScore * W_ASPECT +
        complexityScore * W_COMPLEXITY +
        areaScore * W_AREA +
        edgeDensityScore * W_EDGE_DENSITY +
        spatialSpreadScore * W_SPATIAL_SPREAD
    );

    // ── Pass decision ───────────────────────────────────────────────
    // Must clear ALL hard gates AND the weighted threshold.
    const passed =
      total >= PASS_THRESHOLD &&
      longSide >= MIN_LONG_SIDE &&
      shortSide >= MIN_SHORT_SIDE &&
      !isPortrait &&
      uniqueColors >= MIN_UNIQUE_COLORS &&
      edgeDensityRaw >= MIN_EDGE_DENSITY &&
      spreadRatio >= MIN_SPREAD_RATIO;

    if (passed) {
      reasons.push(
        `PASS: total=${total}, ${width}×${height}, ${uniqueColors} colors, ` +
          `edge=${edgeDensityRaw.toFixed(1)}, spread=${(spreadRatio * 100).toFixed(0)}%`
      );
    } else if (reasons.length === 0) {
      reasons.push(`FAIL: total=${total} < ${PASS_THRESHOLD} threshold`);
    }

    const score: OgHeroScore = {
      scores: {
        resolution: Math.round(resolutionScore),
        aspectRatio: Math.round(aspectScore),
        complexity: Math.round(complexityScore),
        area: Math.round(areaScore),
        edgeDensity: Math.round(edgeDensityScore),
        spatialSpread: Math.round(spatialSpreadScore),
      },
      total,
      passed,
      reasons,
    };

    // ── Process to 1160×1160 if passed ──────────────────────────────
    let processedImageDataUrl: string | null = null;
    if (passed) {
      const resized = await resizeImage(buffer, 1160, 1160, "cover");
      processedImageDataUrl = `data:image/png;base64,${resized.toString("base64")}`;
    }

    return { ogImageUrl, passed, processedImageDataUrl, score };
  } catch (error) {
    // Fetch or Sharp failure — fail gracefully
    return {
      ogImageUrl,
      passed: false,
      processedImageDataUrl: null,
      score: {
        scores: {
          resolution: 0,
          aspectRatio: 0,
          complexity: 0,
          area: 0,
          edgeDensity: 0,
          spatialSpread: 0,
        },
        total: 0,
        passed: false,
        reasons: [
          `error: ${error instanceof Error ? error.message : "unknown"}`,
        ],
      },
    };
  }
}

// ─── Scraped hero fallback ──────────────────────────────────────────────────

export interface ScrapedHeroEvaluation extends OgHeroEvaluation {
  /** How many hero images passed the pre-filter (dimension check). */
  candidatesConsidered: number;
  /** How many were actually fetched and evaluated before a winner or exhaustion. */
  candidatesTried: number;
}

/**
 * Evaluate scraped hero images as login hero candidates.
 *
 * Filters, deduplicates, and ranks hero images by size, then tries the top
 * candidates through the same quality gate as OG images.  Returns the first
 * passing result, or a fail result if none pass.
 *
 * Only runs when the OG image has already failed — so this adds zero cost to
 * the happy path.
 */
export async function evaluateScrapedHeroes(
  images: Array<{ url: string; width?: number; height?: number; type: string }>,
  ogUrl: string | null,
  maxTries = 3
): Promise<ScrapedHeroEvaluation> {
  // 1. Filter to hero type only
  const heroes = images.filter((img) => img.type === "hero");

  // 2. Deduplicate URLs, exclude the OG image, and skip data: URIs (placeholders)
  const seen = new Set<string>();
  if (ogUrl) seen.add(ogUrl);

  const unique = heroes.filter((img) => {
    if (img.url.startsWith("data:")) return false;
    if (seen.has(img.url)) return false;
    seen.add(img.url);
    return true;
  });

  // 3. Pre-filter by dimension metadata — skip images that are clearly too
  //    small or portrait.  Use relaxed thresholds (smaller than the hard gates
  //    in evaluateOgHero) because scraped dimensions can be inaccurate (CSS
  //    sizing vs intrinsic resolution).  The quality gate handles the rest.
  //    CSS background images (width=0) are excluded — no reliable dimensions.
  const PREFILTER_MIN_LONG = 400;
  const PREFILTER_MIN_SHORT = 200;

  const prefiltered = unique.filter((img) => {
    const w = img.width ?? 0;
    const h = img.height ?? 0;
    if (w === 0 || h === 0) return false;
    const longSide = Math.max(w, h);
    const shortSide = Math.min(w, h);
    if (longSide < PREFILTER_MIN_LONG) return false;
    if (shortSide < PREFILTER_MIN_SHORT) return false;
    if (h > w * MAX_PORTRAIT_RATIO) return false;
    return true;
  });

  // 4. Sort by pixel area descending (largest first — most likely to be a hero)
  const sorted = [...prefiltered].sort((a, b) => {
    const areaA = (a.width ?? 0) * (a.height ?? 0);
    const areaB = (b.width ?? 0) * (b.height ?? 0);
    return areaB - areaA;
  });

  // 5. Try top N candidates through the same quality gate
  const candidates = sorted.slice(0, maxTries);

  let bestFailedScore: OgHeroScore | null = null;
  let bestFailedUrl: string | null = null;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    console.log(
      `[scraped-hero] trying candidate ${i + 1}/${candidates.length}: ` +
        `${candidate.width}×${candidate.height} ${candidate.url.substring(0, 100)}`
    );
    const result = await evaluateOgHero(candidate.url);
    if (result.score) {
      console.log(
        `[scraped-hero] candidate ${i + 1} → ${result.passed ? "PASS" : "FAIL"} ` +
          `total=${result.score.total} (${result.score.reasons.join("; ")})`
      );
    }
    if (result.passed && result.processedImageDataUrl) {
      return {
        ...result,
        candidatesConsidered: prefiltered.length,
        candidatesTried: i + 1,
      };
    }
    // Track the best-scoring failure for debug output
    if (result.score && (!bestFailedScore || result.score.total > bestFailedScore.total)) {
      bestFailedScore = result.score;
      bestFailedUrl = candidate.url;
    }
  }

  // None passed — return the best failed score for debug visibility
  return {
    ogImageUrl: bestFailedUrl,
    passed: false,
    processedImageDataUrl: null,
    score: bestFailedScore,
    candidatesConsidered: prefiltered.length,
    candidatesTried: candidates.length,
  };
}
