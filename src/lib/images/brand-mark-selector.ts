/**
 * Brand Mark Selector
 *
 * Replaces the naive "favicon → squareIcon" pipeline with a multi-candidate
 * evaluation system.  Gathers candidates from favicon, logo, and manifest
 * icon extractors, analyses each with Sharp-based heuristics, scores them,
 * and returns the best one ready for square-icon normalisation.
 *
 * ── Public API ──────────────────────────────────────────────────────────
 * selectBestBrandMark(favicon, logo, manifestIcons) → BrandMarkSelectionResult
 * processBrandMark(candidate)                       → data:image/png;base64 | ""
 */

import sharp from "sharp";

// ─── Constants ──────────────────────────────────────────────────────────

const FETCH_TIMEOUT = 5_000; // ms per candidate fetch
const MIN_ICON_SIZE = 16; // reject anything smaller (tracking pixels)
const RESIZE_TARGET = 300; // final squareIcon output resolution
const RESIZE_THRESHOLD = 128; // above this we resize to RESIZE_TARGET
const MINIMUM_VIABLE_SCORE = 35; // below this → fall back to initials
const FAVICON_PREFERENCE_BUFFER = 15; // favicon wins ties within this margin

// ─── Platform-default favicon patterns ──────────────────────────────────
// Generic favicons shipped by site-builders / CMS platforms.  These are
// *not* brand-specific and should be disqualified so the pipeline falls
// back to a real logo or initials.
// Each entry is a regex tested against the full favicon URL.
const PLATFORM_DEFAULT_FAVICONS: RegExp[] = [
  // Webflow — generic webclip shipped with every new project
  /\/img\/webclip\.png$/i,
  // WordPress — default "W" logo
  /wp-includes\/images\/w-logo/i,
  /wp-content\/themes\/flavor\/favicon/i,
  // Wix — generic default favicons
  /fav-icon\.ico$/i,
  /wixstatic\.com\/.*\/favicon\.ico$/i,
  // Squarespace — default favicon
  /static1\.squarespace\.com\/static\/.*\/favicon\.ico$/i,
  // Shopify — generic default icons
  /cdn\.shopify\.com\/s\/files\/.*\/favicon/i,
  // GoDaddy Website Builder
  /img\.websitebuilder\.com\/.*favicon/i,
  // Weebly
  /weebly\.com\/.*\/favicon/i,
  // Google Sites
  /sites\.google\.com\/.*\/favicon/i,
];

/** Check if a favicon URL matches a known platform-default pattern. */
function isPlatformDefaultFavicon(url: string): string | null {
  for (const pattern of PLATFORM_DEFAULT_FAVICONS) {
    if (pattern.test(url)) {
      return pattern.source;
    }
  }
  return null;
}

// ─── Score weights (must sum to 1.0) ────────────────────────────────────

const W_ASPECT = 0.25;
const W_RESOLUTION = 0.20;
const W_COMPLEXITY = 0.20;
const W_SOURCE = 0.15;
const W_MONOGRAM = 0.20;

// ─── Types ──────────────────────────────────────────────────────────────

export type BrandMarkSource = "favicon" | "logo" | "manifest";

export interface BrandMarkCandidate {
  url: string;
  source: BrandMarkSource;
}

export interface BrandMarkScores {
  aspect: number;
  resolution: number;
  complexity: number;
  source: number;
  monogram: number;
}

export interface BrandMarkAnalysis {
  width: number;
  height: number;
  aspectRatio: number;
  resolution: number;
  uniqueColorCount: number;
  isLikelyMonogram: boolean;
  monogramConfidence: number;
  smoothRatio: number;
  photoPenalty: number;
  scores: BrandMarkScores;
  totalScore: number;
  disqualified: boolean;
  disqualifyReason?: string;
}

export interface EvaluatedCandidate extends BrandMarkCandidate {
  analysis: BrandMarkAnalysis | null;
  /** Raw image buffer, kept around so we don't re-fetch during processing */
  _buffer?: Buffer;
}

export interface BrandMarkSelectionResult {
  selected: EvaluatedCandidate | null;
  candidates: EvaluatedCandidate[];
  fallbackToInitials: boolean;
  log: string[];
}

// ─── Candidate Gathering ────────────────────────────────────────────────

/**
 * Build the candidate list from all available sources.
 * Deduplicates by URL.  Order: favicon, manifest (up to 2), logo.
 */
function gatherCandidates(
  favicon: string | null,
  logo: string | null,
  manifestIcons: string[]
): BrandMarkCandidate[] {
  const seen = new Set<string>();
  const candidates: BrandMarkCandidate[] = [];

  const add = (url: string | null, source: BrandMarkSource) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    candidates.push({ url, source });
  };

  add(favicon, "favicon");
  for (const icon of manifestIcons.slice(0, 2)) {
    add(icon, "manifest");
  }
  add(logo, "logo");

  return candidates;
}

// ─── Individual Scoring Functions ───────────────────────────────────────

/** Resolution score: 0–100.  PWA-standard 192+ = 100. */
function scoreResolution(maxDim: number): number {
  if (maxDim >= 192) return 100;
  if (maxDim >= 128) return 80 + ((maxDim - 128) / 64) * 20;
  if (maxDim >= 64) return 50 + ((maxDim - 64) / 64) * 30;
  if (maxDim >= 32) return 25 + ((maxDim - 32) / 32) * 25;
  if (maxDim >= 16) return ((maxDim - 16) / 16) * 25;
  return 0;
}

/** Aspect-ratio score: 0–100.  Perfect square = 100. */
function scoreAspect(width: number, height: number): number {
  const ratio = width / height;
  // Normalise so ratio is always ≥ 1 (treat tall the same as wide)
  const r = ratio >= 1 ? ratio : 1 / ratio;

  if (r <= 1.05) return 100;
  if (r <= 1.2) return 100 - ((r - 1.05) / 0.15) * 30; // 70–100
  if (r <= 2.0) return 70 - ((r - 1.2) / 0.8) * 30; // 40–70
  if (r <= 3.5) return 40 - ((r - 2.0) / 1.5) * 25; // 15–40
  return Math.max(0, 15 - (r - 3.5) * 4); // 0–15
}

/**
 * Complexity score: 0–100.
 * Counts unique quantised colors in a 50×50 thumbnail.
 * Solid fills score 0; rich icons score 100.
 */
async function scoreComplexity(buffer: Buffer): Promise<{ score: number; uniqueColors: number }> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(50, 50, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colorSet = new Set<string>();
    const step = 16;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = Math.round(data[i] / step) * step;
      const g = Math.round(data[i + 1] / step) * step;
      const b = Math.round(data[i + 2] / step) * step;
      colorSet.add(`${r},${g},${b}`);
    }

    const n = colorSet.size;
    let score: number;
    if (n <= 1) score = 0;
    else if (n <= 3) score = 30;
    else if (n <= 10) score = 60 + ((n - 3) / 7) * 40;
    else score = 100;

    return { score, uniqueColors: n };
  } catch {
    return { score: 50, uniqueColors: -1 }; // Can't analyse → neutral
  }
}

/**
 * Photo detection — measures how "photographic" an image is.
 *
 * Icons/logos have flat color regions with hard edges: most neighboring
 * pixel pairs have very low gradient (< 10 total RGB diff), and the
 * number of unique quantised colors is moderate (< 100 at q16).
 *
 * Photos have continuous tonal variation: few flat regions, many unique
 * colors, and a high average gradient.
 *
 * We combine two signals:
 *   1. lowGradRatio — fraction of pixel-pairs with gradient < 10
 *      (icons ~60-90%, photos ~5-15%)
 *   2. uniqueColors at q16 quantisation
 *      (icons ~20-80, photos ~120-250+)
 *
 * Returns a smoothRatio ∈ [0, 1] (higher = more photographic) and a
 * multiplicative penalty factor for the total score.
 */
async function detectPhotoness(
  buffer: Buffer
): Promise<{ smoothRatio: number; penaltyFactor: number }> {
  try {
    const SIZE = 50;
    const { data, info } = await sharp(buffer)
      .resize(SIZE, SIZE, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const ch = info.channels; // 3 (RGB)

    // Count unique quantised colors (step 16)
    const colorSet = new Set<string>();
    const step = 16;
    for (let i = 0; i < data.length; i += ch) {
      const r = Math.round(data[i] / step) * step;
      const g = Math.round(data[i + 1] / step) * step;
      const b = Math.round(data[i + 2] / step) * step;
      colorSet.add(`${r},${g},${b}`);
    }
    const uniqueColors = colorSet.size;

    // Count low-gradient pixel pairs (flat regions)
    let lowGradCount = 0;
    let totalComparisons = 0;

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const idx = (row * SIZE + col) * ch;

        // Right neighbor
        if (col < SIZE - 1) {
          const rIdx = idx + ch;
          const diff =
            Math.abs(data[idx] - data[rIdx]) +
            Math.abs(data[idx + 1] - data[rIdx + 1]) +
            Math.abs(data[idx + 2] - data[rIdx + 2]);
          if (diff < 10) lowGradCount++;
          totalComparisons++;
        }

        // Bottom neighbor
        if (row < SIZE - 1) {
          const bIdx = ((row + 1) * SIZE + col) * ch;
          const diff =
            Math.abs(data[idx] - data[bIdx]) +
            Math.abs(data[idx + 1] - data[bIdx + 1]) +
            Math.abs(data[idx + 2] - data[bIdx + 2]);
          if (diff < 10) lowGradCount++;
          totalComparisons++;
        }
      }
    }

    const lowGradRatio = totalComparisons > 0 ? lowGradCount / totalComparisons : 1;

    // Combine signals into a "photoness" score [0..1]
    // Low flat regions + many colors = likely photo
    // High flat regions + few colors = likely icon
    const colorSignal = Math.min(1, Math.max(0, (uniqueColors - 80) / 120)); // 0 at ≤80, 1 at ≥200
    const gradSignal = Math.min(1, Math.max(0, (0.40 - lowGradRatio) / 0.30)); // 0 at ≥40% flat, 1 at ≤10% flat
    const smoothRatio = (colorSignal + gradSignal) / 2;

    // Penalty thresholds
    let penaltyFactor: number;
    if (smoothRatio < 0.45) penaltyFactor = 1.0;     // icons — no penalty
    else if (smoothRatio <= 0.65) penaltyFactor = 0.7; // ambiguous — mild penalty
    else penaltyFactor = 0.35;                         // photographs — heavy penalty

    return { smoothRatio: +smoothRatio.toFixed(3), penaltyFactor };
  } catch {
    return { smoothRatio: 0, penaltyFactor: 1.0 }; // Can't analyse → no penalty
  }
}

/** Source trust score: 0–100. */
function scoreSource(source: BrandMarkSource): number {
  switch (source) {
    case "manifest":
      return 90;
    case "favicon":
      return 70;
    case "logo":
      return 50;
    default:
      return 30;
  }
}

/**
 * Lightweight monogram / single-glyph detection.
 *
 * 1. Resize to 64×64 grayscale, threshold to binary.
 * 2. Count foreground-pixel ratio.
 * 3. Measure bounding-box tightness (how compactly the foreground sits).
 *
 * Full logos fill more of the frame; single characters sit in a compact
 * central region with large padding on all sides.
 *
 * Returns { isLikely, confidence } where confidence ∈ [0, 1].
 */
async function detectMonogram(
  buffer: Buffer
): Promise<{ isLikely: boolean; confidence: number }> {
  try {
    const SIZE = 64;
    const { data } = await sharp(buffer)
      .resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .grayscale()
      .threshold(128) // Otsu-like binary
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Count foreground (black = 0) pixels
    let fgCount = 0;
    const totalPixels = SIZE * SIZE;

    // Track bounding box
    let minRow = SIZE;
    let maxRow = 0;
    let minCol = SIZE;
    let maxCol = 0;

    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        const val = data[row * SIZE + col];
        if (val === 0) {
          // foreground pixel
          fgCount++;
          if (row < minRow) minRow = row;
          if (row > maxRow) maxRow = row;
          if (col < minCol) minCol = col;
          if (col > maxCol) maxCol = col;
        }
      }
    }

    if (fgCount === 0) {
      // All white / transparent → not a monogram, but not useful either
      return { isLikely: false, confidence: 0 };
    }

    const fgRatio = fgCount / totalPixels;
    const bboxW = maxCol - minCol + 1;
    const bboxH = maxRow - minRow + 1;
    const bboxArea = bboxW * bboxH;
    const bboxFill = bboxArea / (SIZE * SIZE); // how much of the frame the bbox covers

    // Monogram signals:
    // - Low foreground ratio (< 0.35): character doesn't fill the frame
    // - Compact bounding box (< 0.50): character sits in a small region
    const fgSignal = fgRatio < 0.35 ? (0.35 - fgRatio) / 0.35 : 0; // 0–1, higher = more likely
    const bboxSignal = bboxFill < 0.50 ? (0.50 - bboxFill) / 0.50 : 0; // 0–1, higher = more likely

    // Combine: both signals need to agree for high confidence
    const confidence = Math.min(1, (fgSignal + bboxSignal) / 1.4);
    const isLikely = confidence > 0.45;

    return { isLikely, confidence };
  } catch {
    return { isLikely: false, confidence: 0 };
  }
}

// ─── ICO Handling (reused from processor.ts logic) ──────────────────────

/**
 * If buffer is an ICO file, extract the largest embedded PNG frame.
 * Returns the PNG buffer, or null if ICO with only BMP frames.
 * If not an ICO, returns the buffer unchanged.
 */
function extractPngFromIcoIfNeeded(buffer: Buffer): { buffer: Buffer; wasIco: boolean } | null {
  // ICO magic: 00 00 01 00
  if (
    buffer.length > 6 &&
    buffer[0] === 0 &&
    buffer[1] === 0 &&
    buffer[2] === 1 &&
    buffer[3] === 0
  ) {
    const count = buffer.readUInt16LE(4);
    let bestPng: Buffer | null = null;
    let bestSize = 0;

    for (let i = 0; i < count; i++) {
      const dirOffset = 6 + i * 16;
      if (dirOffset + 16 > buffer.length) break;

      const w = buffer[dirOffset] || 256;
      const dataSize = buffer.readUInt32LE(dirOffset + 8);
      const dataOffset = buffer.readUInt32LE(dirOffset + 12);

      if (dataOffset + dataSize > buffer.length) continue;

      // PNG magic: 89 50 4E 47
      if (
        buffer[dataOffset] === 0x89 &&
        buffer[dataOffset + 1] === 0x50 &&
        buffer[dataOffset + 2] === 0x4e &&
        buffer[dataOffset + 3] === 0x47
      ) {
        if (w > bestSize) {
          bestSize = w;
          bestPng = buffer.subarray(dataOffset, dataOffset + dataSize);
        }
      }
    }

    if (!bestPng) return null; // ICO with only BMP frames
    return { buffer: bestPng, wasIco: true };
  }

  return { buffer, wasIco: false };
}

// ─── Fetch with Timeout ─────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Buffer> {
  // Data URLs: decode directly
  if (url.startsWith("data:")) {
    // SVG data URL
    if (url.startsWith("data:image/svg+xml,")) {
      const svgContent = decodeURIComponent(url.replace("data:image/svg+xml,", ""));
      return sharp(Buffer.from(svgContent)).png().toBuffer();
    }
    // Base64 data URL
    const base64Match = url.match(/^data:[^;]+;base64,(.+)$/);
    if (base64Match) {
      return Buffer.from(base64Match[1], "base64");
    }
    throw new Error("Unsupported data URL format");
  }

  // Remote URL
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandScraper/1.0)" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ─── Candidate Evaluation ───────────────────────────────────────────────

async function evaluateCandidate(
  candidate: BrandMarkCandidate
): Promise<EvaluatedCandidate> {
  try {
    // ── Platform-default favicon check ──────────────────────────────
    // Disqualify generic builder favicons before even fetching pixels.
    if (candidate.source === "favicon") {
      const matchedPattern = isPlatformDefaultFavicon(candidate.url);
      if (matchedPattern) {
        return {
          ...candidate,
          analysis: {
            width: 0,
            height: 0,
            aspectRatio: 0,
            resolution: 0,
            uniqueColorCount: 0,
            isLikelyMonogram: false,
            monogramConfidence: 0,
            smoothRatio: 0,
            photoPenalty: 1.0,
            scores: { aspect: 0, resolution: 0, complexity: 0, source: 0, monogram: 0 },
            totalScore: 0,
            disqualified: true,
            disqualifyReason: `Platform default favicon (matched: ${matchedPattern})`,
          },
        };
      }
    }

    let buffer = await fetchWithTimeout(candidate.url, FETCH_TIMEOUT);

    // Handle ICO files
    const icoResult = extractPngFromIcoIfNeeded(buffer);
    if (!icoResult) {
      return {
        ...candidate,
        analysis: {
          width: 0,
          height: 0,
          aspectRatio: 0,
          resolution: 0,
          uniqueColorCount: 0,
          isLikelyMonogram: false,
          monogramConfidence: 0,
          smoothRatio: 0,
          photoPenalty: 1.0,
          scores: { aspect: 0, resolution: 0, complexity: 0, source: 0, monogram: 0 },
          totalScore: 0,
          disqualified: true,
          disqualifyReason: "ICO with no extractable PNG frames",
        },
      };
    }
    buffer = icoResult.buffer;

    // Get dimensions
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const maxDim = Math.max(width, height);

    if (maxDim < MIN_ICON_SIZE) {
      return {
        ...candidate,
        analysis: {
          width,
          height,
          aspectRatio: height > 0 ? width / height : 0,
          resolution: maxDim,
          uniqueColorCount: 0,
          isLikelyMonogram: false,
          monogramConfidence: 0,
          smoothRatio: 0,
          photoPenalty: 1.0,
          scores: { aspect: 0, resolution: 0, complexity: 0, source: 0, monogram: 0 },
          totalScore: 0,
          disqualified: true,
          disqualifyReason: `Too small: ${width}×${height} (min ${MIN_ICON_SIZE}px)`,
        },
      };
    }

    // Run analysis in parallel
    const [complexityResult, monogramResult, photonessResult] = await Promise.all([
      scoreComplexity(buffer),
      detectMonogram(buffer),
      detectPhotoness(buffer),
    ]);

    const aspectScore = scoreAspect(width, height);
    const resolutionScore = scoreResolution(maxDim);
    const sourceScore = scoreSource(candidate.source);
    const monogramScore = monogramResult.isLikely
      ? (1 - monogramResult.confidence) * 100
      : 100;

    const scores: BrandMarkScores = {
      aspect: Math.round(aspectScore),
      resolution: Math.round(resolutionScore),
      complexity: Math.round(complexityResult.score),
      source: sourceScore,
      monogram: Math.round(monogramScore),
    };

    // Base score from weighted dimensions
    const baseScore =
      scores.aspect * W_ASPECT +
      scores.resolution * W_RESOLUTION +
      scores.complexity * W_COMPLEXITY +
      scores.source * W_SOURCE +
      scores.monogram * W_MONOGRAM;

    // Apply photo-detection penalty: photographs get heavily penalized
    // because they look wrong as small brand icons in sidebar/login.
    const totalScore = Math.round(baseScore * photonessResult.penaltyFactor);

    return {
      ...candidate,
      _buffer: buffer,
      analysis: {
        width,
        height,
        aspectRatio: height > 0 ? +(width / height).toFixed(2) : 0,
        resolution: maxDim,
        uniqueColorCount: complexityResult.uniqueColors,
        isLikelyMonogram: monogramResult.isLikely,
        monogramConfidence: +monogramResult.confidence.toFixed(2),
        smoothRatio: photonessResult.smoothRatio,
        photoPenalty: photonessResult.penaltyFactor,
        scores,
        totalScore,
        disqualified: false,
      },
    };
  } catch (err) {
    return {
      ...candidate,
      analysis: {
        width: 0,
        height: 0,
        aspectRatio: 0,
        resolution: 0,
        uniqueColorCount: 0,
        isLikelyMonogram: false,
        monogramConfidence: 0,
        smoothRatio: 0,
        photoPenalty: 1.0,
        scores: { aspect: 0, resolution: 0, complexity: 0, source: 0, monogram: 0 },
        totalScore: 0,
        disqualified: true,
        disqualifyReason: err instanceof Error ? err.message : "Evaluation failed",
      },
    };
  }
}

// ─── Selection ──────────────────────────────────────────────────────────

/**
 * Main entry point.
 *
 * Gathers candidates from all sources, evaluates each in parallel,
 * scores them, and returns the best one (or null → initials fallback).
 */
export async function selectBestBrandMark(
  favicon: string | null,
  logo: string | null,
  manifestIcons: string[]
): Promise<BrandMarkSelectionResult> {
  const log: string[] = [];
  const candidates = gatherCandidates(favicon, logo, manifestIcons);

  if (candidates.length === 0) {
    log.push("No candidates available");
    return { selected: null, candidates: [], fallbackToInitials: true, log };
  }

  log.push(`${candidates.length} candidates: ${candidates.map((c) => c.source).join(", ")}`);

  // Evaluate all in parallel
  const results = await Promise.allSettled(candidates.map(evaluateCandidate));
  const evaluated: EvaluatedCandidate[] = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          ...candidates[i],
          analysis: {
            width: 0,
            height: 0,
            aspectRatio: 0,
            resolution: 0,
            uniqueColorCount: 0,
            isLikelyMonogram: false,
            monogramConfidence: 0,
            smoothRatio: 0,
            photoPenalty: 1.0,
            scores: { aspect: 0, resolution: 0, complexity: 0, source: 0, monogram: 0 },
            totalScore: 0,
            disqualified: true,
            disqualifyReason: "Promise rejected",
          },
        }
  );

  // Filter qualified
  const qualified = evaluated.filter((c) => !c.analysis?.disqualified);
  const disqualifiedCount = evaluated.length - qualified.length;
  if (disqualifiedCount > 0) {
    const reasons = evaluated
      .filter((c) => c.analysis?.disqualified)
      .map((c) => `${c.source}: ${c.analysis?.disqualifyReason}`);
    log.push(`Disqualified ${disqualifiedCount}: ${reasons.join("; ")}`);
  }

  if (qualified.length === 0) {
    log.push("All candidates disqualified → initials");
    return { selected: null, candidates: evaluated, fallbackToInitials: true, log };
  }

  // Sort by score descending
  qualified.sort((a, b) => (b.analysis?.totalScore ?? 0) - (a.analysis?.totalScore ?? 0));

  const best = qualified[0];
  const bestScore = best.analysis?.totalScore ?? 0;

  // Quality threshold
  if (bestScore < MINIMUM_VIABLE_SCORE) {
    log.push(
      `Best score ${bestScore} (${best.source}) below threshold ${MINIMUM_VIABLE_SCORE} → initials`
    );
    return { selected: null, candidates: evaluated, fallbackToInitials: true, log };
  }

  // Favicon preference: keep favicon unless another source is clearly better
  if (best.source !== "favicon") {
    const faviconEntry = qualified.find((c) => c.source === "favicon");
    if (faviconEntry) {
      const faviconScore = faviconEntry.analysis?.totalScore ?? 0;
      const diff = bestScore - faviconScore;
      if (diff < FAVICON_PREFERENCE_BUFFER) {
        log.push(
          `Favicon preference: keeping favicon (${faviconScore}) over ${best.source} (${bestScore}), diff ${diff} < ${FAVICON_PREFERENCE_BUFFER}`
        );
        return { selected: faviconEntry, candidates: evaluated, fallbackToInitials: false, log };
      }
      log.push(
        `${best.source} (${bestScore}) beats favicon (${faviconScore}) by ${diff}pts`
      );
    }
  } else {
    log.push(`Favicon wins with score ${bestScore}`);
  }

  return { selected: best, candidates: evaluated, fallbackToInitials: false, log };
}

// ─── Square Normalization + Processing ──────────────────────────────────

/**
 * Normalise a non-square image to square before the standard sizing pipeline.
 *
 * - Square-ish (0.8–1.2):  contain with transparent padding
 * - Moderate (1.2–2.0):    contain with transparent padding
 * - Wide (> 2.0):          crop left portion (where icon mark usually sits), then contain
 * - Tall (< 0.8):          contain with transparent padding
 */
async function normalizeToSquare(buffer: Buffer, width: number, height: number): Promise<Buffer> {
  const ratio = width / height;

  if (ratio > 2.0) {
    // Wide wordmark: crop leftmost ~40% where the icon/mark usually sits
    const cropWidth = Math.min(Math.round(height * 1.5), Math.round(width * 0.4));
    const cropped = await sharp(buffer)
      .extract({ left: 0, top: 0, width: Math.min(cropWidth, width), height })
      .toBuffer();

    const targetSize = Math.max(cropWidth, height);
    return sharp(cropped)
      .resize(targetSize, targetSize, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .png()
      .toBuffer();
  }

  // All other ratios: contain with transparent padding
  const targetSize = Math.max(width, height);
  return sharp(buffer)
    .resize(targetSize, targetSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();
}

/**
 * Process a selected brand-mark candidate into the final squareIcon data URL.
 *
 * Handles: square normalization → sizing (300×300 or passthrough) → base64.
 * Mirrors the logic of `processSquareIcon()` from processor.ts but works
 * on the already-fetched buffer.
 */
export async function processBrandMark(candidate: EvaluatedCandidate): Promise<string> {
  try {
    let buffer = candidate._buffer;

    if (!buffer) {
      // Buffer wasn't cached (shouldn't happen, but safety net)
      buffer = await fetchWithTimeout(candidate.url, FETCH_TIMEOUT);
      const icoResult = extractPngFromIcoIfNeeded(buffer);
      if (!icoResult) return "";
      buffer = icoResult.buffer;
    }

    const width = candidate.analysis?.width ?? 0;
    const height = candidate.analysis?.height ?? 0;

    // Normalize non-square images
    if (width > 0 && height > 0) {
      const ratio = width / height;
      const invRatio = height / width;
      if (ratio > 1.2 || invRatio > 1.2) {
        buffer = await normalizeToSquare(buffer, width, height);
      }
    }

    // Standard sizing pipeline (matches processSquareIcon logic)
    const meta = await sharp(buffer).metadata();
    const srcSize = Math.max(meta.width ?? 0, meta.height ?? 0);

    if (srcSize < MIN_ICON_SIZE) return "";

    if (srcSize >= RESIZE_THRESHOLD) {
      const resized = await sharp(buffer)
        .ensureAlpha()
        .resize(RESIZE_TARGET, RESIZE_TARGET, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      return `data:image/png;base64,${resized.toString("base64")}`;
    }

    // Small source: pass through at native resolution
    const passthrough = await sharp(buffer).ensureAlpha().png().toBuffer();
    return `data:image/png;base64,${passthrough.toString("base64")}`;
  } catch (error) {
    console.error("Error processing brand mark:", error);
    return "";
  }
}
