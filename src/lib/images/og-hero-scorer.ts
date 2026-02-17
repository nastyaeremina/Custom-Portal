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
  /** Processed hero image result — null if not passed. */
  processedImage: HeroImageResult | null;
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
    return { ogImageUrl: null, passed: false, processedImage: null, score: null };
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
    // We preserve the original aspect ratio (no square crop), so landscape
    // images are no longer destructively cropped.  The browser's CSS
    // object-cover handles the final fit.  Mild landscape is ideal for the
    // tall login container; very wide images get a blurred background
    // extension.  Portrait images are still hard-rejected.
    let aspectScore: number;
    const isPortrait = height > width * MAX_PORTRAIT_RATIO;
    const landscapeRatio = width > 0 && height > 0 ? width / height : 1;

    if (isPortrait) {
      aspectScore = 0;
      reasons.push(`portrait ${width}×${height} (h > w × ${MAX_PORTRAIT_RATIO})`);
    } else if (landscapeRatio <= 1.5) {
      aspectScore = 100; // square to mild landscape — ideal
    } else if (landscapeRatio <= 2.0) {
      // Standard OG ratio — CSS will crop sides mildly
      aspectScore = 60 + ((2.0 - landscapeRatio) / 0.5) * 40; // 60–100
    } else if (landscapeRatio <= 2.5) {
      // Wide — blurred bg extension kicks in, still usable
      aspectScore = 30 + ((2.5 - landscapeRatio) / 0.5) * 30; // 30–60
      reasons.push(`wide ${landscapeRatio.toFixed(1)}:1`);
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

    // ── Prepare hero image if passed ─────────────────────────
    let processedImage: HeroImageResult | null = null;
    if (passed) {
      processedImage = await prepareHeroImage(buffer);
    }

    return { ogImageUrl, passed, processedImage, score };
  } catch (error) {
    // Fetch or Sharp failure — fail gracefully
    return {
      ogImageUrl,
      passed: false,
      processedImage: null,
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

// ─── Hero image classifier ──────────────────────────────────────────────────

/** Thumbnail size for classification pixel analysis. */
const CLASSIFY_SIZE = 100;

/** Quantization step for color counting in classifier. */
const CLASSIFY_Q_STEP = 24;

/** Points needed to classify as text-heavy. Errs toward photo when uncertain. */
const TEXT_HEAVY_THRESHOLD = 45;

export interface HeroClassification {
  type: "text_heavy" | "photo";
  confidence: number; // 0.0–1.0
  /** Raw text-likelihood score (0–100). Higher = more text-heavy. */
  textLikelihood: number;
  signals: Record<string, number>;
}

export interface HeroImageResult {
  dataUrl: string;
  orientation: "landscape" | "portrait" | "square";
  imageType: "text_heavy" | "photo";
  confidence: number;
  /** Raw text-likelihood score from the classifier (0–100). Higher = more text-heavy. */
  textLikelihood: number;
  /** Dominant edge color (hex) sampled from image borders. Used as background
   *  behind contain-fitted text-heavy images so letterboxing blends in. */
  edgeColor: string;
}

/**
 * Classify a hero image as text-heavy (OG banners, UI screenshots, logos)
 * or photo/abstract (safe to crop).
 *
 * Uses 7 lightweight pixel signals on a 100×100 thumbnail. No OCR, no OpenAI.
 */
async function classifyHeroImage(buffer: Buffer): Promise<HeroClassification> {
  const meta = await sharp(buffer).metadata();
  const origW = meta.width ?? 1;
  const origH = meta.height ?? 1;
  const aspectRatio = origW / origH;

  // ── Early exits ──
  if (aspectRatio > 1.85) {
    return {
      type: "text_heavy",
      confidence: 0.85,
      textLikelihood: 80,
      signals: { earlyExit: 1, aspect: aspectRatio },
    };
  }
  if (aspectRatio < 0.67) {
    return {
      type: "photo",
      confidence: 0.80,
      textLikelihood: 10,
      signals: { earlyExit: 2, aspect: aspectRatio },
    };
  }

  try {
    // ── Build 100×100 thumbnail for analysis ──
    const { data, info } = await sharp(buffer)
      .resize(CLASSIFY_SIZE, CLASSIFY_SIZE, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const ch = info.channels;
    const totalPixels = w * h;

    // ── Signal 1: High-contrast edge ratio ──
    // Text/UI has many sharp edges (gradient > 40); photos have gradual transitions
    let highEdgeCount = 0;
    let totalEdgeCount = 0;
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const idx = (y * w + x) * ch;
        const rIdx = idx + ch;
        const bIdx = ((y + 1) * w + x) * ch;
        const hGrad = (Math.abs(data[idx] - data[rIdx]) +
          Math.abs(data[idx + 1] - data[rIdx + 1]) +
          Math.abs(data[idx + 2] - data[rIdx + 2])) / 3;
        const vGrad = (Math.abs(data[idx] - data[bIdx]) +
          Math.abs(data[idx + 1] - data[bIdx + 1]) +
          Math.abs(data[idx + 2] - data[bIdx + 2])) / 3;
        const grad = Math.max(hGrad, vGrad);
        totalEdgeCount++;
        if (grad > 40) highEdgeCount++;
      }
    }
    const highContrastRatio = totalEdgeCount > 0 ? highEdgeCount / totalEdgeCount : 0;

    // ── Signal 2: Background uniformity (flood-fill from corners) ──
    // Large solid bg = marketing banner or logo-on-solid
    const tolerance = 20;
    const visited = new Uint8Array(totalPixels);
    let uniformCount = 0;

    const corners = [
      [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    ];

    for (const [cx, cy] of corners) {
      const stack: [number, number][] = [[cx, cy]];
      const seedIdx = (cy * w + cx) * ch;
      const seedR = data[seedIdx], seedG = data[seedIdx + 1], seedB = data[seedIdx + 2];

      while (stack.length > 0) {
        const [px, py] = stack.pop()!;
        const pIdx = py * w + px;
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        if (visited[pIdx]) continue;

        const dIdx = pIdx * ch;
        if (Math.abs(data[dIdx] - seedR) + Math.abs(data[dIdx + 1] - seedG) +
            Math.abs(data[dIdx + 2] - seedB) > tolerance * 3) continue;

        visited[pIdx] = 1;
        uniformCount++;
        stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
      }
    }
    const bgUniformity = uniformCount / totalPixels;

    // ── Signal 3: Edge orientation bias (H vs V) ──
    // Text/UI is strongly H/V aligned; photos are organic
    let hEdgeSum = 0, vEdgeSum = 0;
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const idx = (y * w + x) * ch;
        const rIdx = idx + ch;
        const bIdx = ((y + 1) * w + x) * ch;
        hEdgeSum += (Math.abs(data[idx] - data[rIdx]) +
          Math.abs(data[idx + 1] - data[rIdx + 1]) +
          Math.abs(data[idx + 2] - data[rIdx + 2])) / 3;
        vEdgeSum += (Math.abs(data[idx] - data[bIdx]) +
          Math.abs(data[idx + 1] - data[bIdx + 1]) +
          Math.abs(data[idx + 2] - data[bIdx + 2])) / 3;
      }
    }
    const edgeTotal = hEdgeSum + vEdgeSum;
    const hvBias = edgeTotal > 0 ? Math.abs(hEdgeSum - vEdgeSum) / edgeTotal : 0;

    // ── Signal 4: Color count (unique quantized colors on 50×50) ──
    const { data: thumbData, info: thumbInfo } = await sharp(buffer)
      .resize(50, 50, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colorSet = new Set<string>();
    for (let i = 0; i < thumbData.length; i += thumbInfo.channels) {
      const r = Math.round(thumbData[i] / CLASSIFY_Q_STEP) * CLASSIFY_Q_STEP;
      const g = Math.round(thumbData[i + 1] / CLASSIFY_Q_STEP) * CLASSIFY_Q_STEP;
      const b = Math.round(thumbData[i + 2] / CLASSIFY_Q_STEP) * CLASSIFY_Q_STEP;
      colorSet.add(`${r},${g},${b}`);
    }
    const uniqueColors = colorSet.size;

    // ── Signal 5: Saturation spread ──
    // Low stddev = designed/flat, high = photo
    let satSum = 0, satSqSum = 0;
    const satCount = thumbData.length / thumbInfo.channels;
    for (let i = 0; i < thumbData.length; i += thumbInfo.channels) {
      const r = thumbData[i] / 255, g = thumbData[i + 1] / 255, b = thumbData[i + 2] / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const s = max === min ? 0 : (l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min));
      satSum += s;
      satSqSum += s * s;
    }
    const satMean = satSum / satCount;
    const satStd = Math.sqrt(Math.max(0, satSqSum / satCount - satMean * satMean));

    // ── Signal 6: Spatial spread (reuse existing function) ──
    const spread = computeSpatialSpread(data, w, h, ch);

    // ── Signal 7: Border emptiness ──
    // Mean activity in 10% border strips vs center 80%
    const borderPx = Math.round(w * 0.10);
    let borderAct = 0, borderN = 0;
    let centerAct = 0, centerN = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * ch;
        // Simple activity: deviation from gray
        const px = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const dev = (Math.abs(data[idx] - px) + Math.abs(data[idx + 1] - px) + Math.abs(data[idx + 2] - px)) / 3;

        const isBorder = x < borderPx || x >= w - borderPx || y < borderPx || y >= h - borderPx;
        if (isBorder) { borderAct += dev; borderN++; }
        else { centerAct += dev; centerN++; }
      }
    }
    const borderRatio = (centerN > 0 && borderN > 0)
      ? (borderAct / borderN) / (centerAct / centerN)
      : 1;

    // ── Score accumulation (positive = lean text_heavy) ──
    let textScore = 0;

    // Signal 1: High-contrast edges
    if (highContrastRatio > 0.40) textScore += 20;
    else if (highContrastRatio > 0.25) textScore += 10;

    // Signal 2: Background uniformity
    if (bgUniformity > 0.35) textScore += 20;
    else if (bgUniformity > 0.20) textScore += 10;

    // Signal 3: H/V orientation bias
    if (hvBias > 0.40) textScore += 15;
    else if (hvBias > 0.25) textScore += 8;

    // Signal 4: Low color count
    if (uniqueColors < 30) textScore += 15;
    else if (uniqueColors < 50) textScore += 8;

    // Signal 5: Low saturation spread
    if (satStd < 0.10) textScore += 10;
    else if (satStd < 0.18) textScore += 5;

    // Signal 6: Low spatial spread (concentrated content)
    if (spread < 0.50) textScore += 10;
    else if (spread < 0.65) textScore += 5;

    // Signal 7: Empty borders
    if (borderRatio < 0.25) textScore += 10;
    else if (borderRatio < 0.40) textScore += 5;

    const isTextHeavy = textScore >= TEXT_HEAVY_THRESHOLD;
    const confidence = Math.min(Math.abs(textScore - TEXT_HEAVY_THRESHOLD) / 30, 1.0);

    const signals: Record<string, number> = {
      highContrastRatio: +highContrastRatio.toFixed(3),
      bgUniformity: +bgUniformity.toFixed(3),
      hvBias: +hvBias.toFixed(3),
      uniqueColors,
      satStd: +satStd.toFixed(3),
      spread: +spread.toFixed(3),
      borderRatio: +borderRatio.toFixed(3),
      textScore,
    };

    console.log(
      `[hero-type] ${origW}×${origH} → ${isTextHeavy ? "TEXT_HEAVY" : "PHOTO"} ` +
        `(conf=${confidence.toFixed(2)}) ` +
        `highContrast=${highContrastRatio.toFixed(2)} bgUniform=${bgUniformity.toFixed(2)} ` +
        `hvBias=${hvBias.toFixed(2)} colors=${uniqueColors} satStd=${satStd.toFixed(2)} ` +
        `spread=${(spread * 100).toFixed(0)}% borderRatio=${borderRatio.toFixed(2)} ` +
        `score=${textScore}`
    );

    return { type: isTextHeavy ? "text_heavy" : "photo", confidence, textLikelihood: textScore, signals };
  } catch {
    return { type: "photo", confidence: 0.5, textLikelihood: 0, signals: { error: 1 } };
  }
}

// ── Hero image preparation ──────────────────────────────────────────────────

/** Max long side for bandwidth — CSS handles the final display. */
const HERO_MAX_SIDE = 1200;

/** JPEG quality for hero images. */
const HERO_JPEG_QUALITY = 82;

/** Border strip thickness (fraction of image dimension) for edge color sampling. */
const EDGE_SAMPLE_STRIP = 0.05;

/**
 * Sample the dominant edge color from the border pixels of an image.
 *
 * Collects pixels from a thin strip around all four edges, averages them,
 * and returns a hex color. Used as the letterbox background behind
 * contain-fitted text-heavy images.
 */
async function sampleEdgeColor(buffer: Buffer): Promise<string> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(100, 100, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const ch = info.channels;
    const strip = Math.max(1, Math.round(w * EDGE_SAMPLE_STRIP));

    let sumR = 0, sumG = 0, sumB = 0, count = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const isBorder =
          x < strip || x >= w - strip || y < strip || y >= h - strip;
        if (!isBorder) continue;

        const idx = (y * w + x) * ch;
        sumR += data[idx];
        sumG += data[idx + 1];
        sumB += data[idx + 2];
        count++;
      }
    }

    if (count === 0) return "#f5f5f5";

    const r = Math.round(sumR / count);
    const g = Math.round(sumG / count);
    const b = Math.round(sumB / count);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  } catch {
    return "#f5f5f5";
  }
}

/**
 * Prepare a hero image for the login screen.
 *
 * 1. Classifies image type (text_heavy vs photo)
 * 2. Samples edge color (used as letterbox bg for text-heavy images)
 * 3. Resizes for bandwidth (cap long side at 1200px, preserve aspect ratio)
 * 4. Converts to JPEG for smaller base64 payloads
 *
 * No cropping. No contain/cover rendering. CSS handles the display.
 */
export async function prepareHeroImage(buffer: Buffer): Promise<HeroImageResult> {
  const classification = await classifyHeroImage(buffer);
  const edgeColor = await sampleEdgeColor(buffer);

  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const ratio = w / h;

  const orientation: "landscape" | "portrait" | "square" =
    ratio > 1.15 ? "landscape" : ratio < 0.87 ? "portrait" : "square";

  const processed = await sharp(buffer)
    .resize({ width: HERO_MAX_SIDE, height: HERO_MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: HERO_JPEG_QUALITY })
    .toBuffer();

  return {
    dataUrl: `data:image/jpeg;base64,${processed.toString("base64")}`,
    orientation,
    imageType: classification.type,
    confidence: classification.confidence,
    textLikelihood: classification.textLikelihood,
    edgeColor,
  };
}

// ─── Scraped hero fallback ──────────────────────────────────────────────────

export interface ScrapedHeroEvaluation extends OgHeroEvaluation {
  /** How many hero images passed the pre-filter (dimension check). */
  candidatesConsidered: number;
  /** How many were actually fetched and evaluated before a winner or exhaustion. */
  candidatesTried: number;
}

/** Below this textLikelihood score, an image is confidently photo-like. */
const PHOTO_PREFERRED_THRESHOLD = 30;

/**
 * Evaluate scraped hero images as login hero candidates.
 *
 * Filters, deduplicates, and ranks hero images by size, then tries the top
 * candidates through the same quality gate as OG images.
 *
 * **Photo preference:** Collects all passing candidates (up to maxTries) and
 * prefers photo-like images (textLikelihood < 30). Only falls back to a
 * text-heavy image if no photo-like option passes the quality gate.
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

  // 5. Try top N candidates through the same quality gate.
  //    Collect all passing results so we can prefer photo-like over text-heavy.
  const candidates = sorted.slice(0, maxTries);

  let bestFailedScore: OgHeroScore | null = null;
  let bestFailedUrl: string | null = null;

  // Passing candidates: { result, index }
  let bestPhoto: { result: OgHeroEvaluation; triedIndex: number } | null = null;
  let bestTextHeavy: { result: OgHeroEvaluation; triedIndex: number } | null = null;

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
    if (result.passed && result.processedImage) {
      const tl = result.processedImage.textLikelihood;
      console.log(
        `[scraped-hero] candidate ${i + 1} textLikelihood=${tl} → ${tl < PHOTO_PREFERRED_THRESHOLD ? "PHOTO" : "TEXT_HEAVY"}`
      );

      if (tl < PHOTO_PREFERRED_THRESHOLD) {
        // Found a photo-like winner — use immediately
        bestPhoto = { result, triedIndex: i };
        break;
      } else if (!bestTextHeavy) {
        // First passing text-heavy — keep as fallback, continue looking for photos
        bestTextHeavy = { result, triedIndex: i };
      }
    } else {
      // Track the best-scoring failure for debug output
      if (result.score && (!bestFailedScore || result.score.total > bestFailedScore.total)) {
        bestFailedScore = result.score;
        bestFailedUrl = candidate.url;
      }
    }
  }

  // Prefer photo-like, fall back to text-heavy
  const winner = bestPhoto ?? bestTextHeavy;
  if (winner) {
    return {
      ...winner.result,
      candidatesConsidered: prefiltered.length,
      candidatesTried: winner.triedIndex + 1,
    };
  }

  // None passed — return the best failed score for debug visibility
  return {
    ogImageUrl: bestFailedUrl,
    passed: false,
    processedImage: null,
    score: bestFailedScore,
    candidatesConsidered: prefiltered.length,
    candidatesTried: candidates.length,
  };
}
