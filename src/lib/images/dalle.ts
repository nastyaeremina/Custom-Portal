import sharp from "sharp";
import chroma from "chroma-js";
import { PortalColorScheme } from "../colors/types";
import { DalleGeneration } from "@/types/api";
import { extractColorsWithDetails } from "../colors/extractor";

export interface ScrapedImageInfo {
  url: string;
  width?: number;
  height?: number;
  type?: string;
}

export interface LogoCenteredInput {
  iconUrl: string | null;
  logoUrl: string | null;
  backgroundColor: string | null;
}

export interface GradientInput {
  scrapedImages: ScrapedImageInfo[];
}

/**
 * Extract dominant background color from an image
 */
async function extractBackgroundColor(imageUrl: string): Promise<string | null> {
  try {
    let buffer: Buffer;

    if (imageUrl.startsWith("data:")) {
      const base64Match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        buffer = Buffer.from(base64Match[2], "base64");
      } else {
        return null;
      }
    } else {
      const response = await fetch(imageUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandScraper/1.0)" },
      });
      if (!response.ok) return null;
      buffer = Buffer.from(await response.arrayBuffer());
    }

    const image = sharp(buffer);

    // Sample a small region from corners to detect background
    const resized = await image
      .resize(10, 10, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;

    // Sample corners (assuming background is often at edges)
    const corners = [
      [0, 0],
      [info.width - 1, 0],
      [0, info.height - 1],
      [info.width - 1, info.height - 1],
    ];

    const colors: string[] = [];
    for (const [x, y] of corners) {
      const idx = (y * info.width + x) * info.channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      colors.push(`#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`);
    }

    // Return most common corner color
    const colorCounts = new Map<string, number>();
    colors.forEach(c => colorCounts.set(c, (colorCounts.get(c) || 0) + 1));
    const sorted = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);

    return sorted[0]?.[0] || null;
  } catch (error) {
    console.error("Error extracting background color:", error);
    return null;
  }
}

/**
 * Fetch an image and return as buffer
 */
async function fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
  try {
    if (imageUrl.startsWith("data:")) {
      const base64Match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        return Buffer.from(base64Match[2], "base64");
      }
      // Handle SVG data URLs
      if (imageUrl.startsWith("data:image/svg+xml")) {
        const svgContent = decodeURIComponent(imageUrl.replace(/^data:image\/svg\+xml[^,]*,/, ""));
        return await sharp(Buffer.from(svgContent)).png().toBuffer();
      }
      return null;
    }

    const response = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandScraper/1.0)" },
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("Error fetching image:", error);
    return null;
  }
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  try {
    const rgb = chroma(hex).rgb();
    return { r: Math.round(rgb[0]), g: Math.round(rgb[1]), b: Math.round(rgb[2]) };
  } catch {
    return { r: 128, g: 128, b: 128 };
  }
}

/**
 * Approach 1: Solid background with logo centered (prefer full logo over icon)
 * Logo takes up ~40% of the space for better visibility
 */
async function generateLogoCenteredImage(
  iconUrl: string | null,
  logoUrl: string | null,
  backgroundColor: string
): Promise<string> {
  // Prefer full logo over icon
  const imageUrl = logoUrl || iconUrl;
  const bgColor = hexToRgb(backgroundColor);

  // Create the base 1160x1160 solid color image
  const baseImage = sharp({
    create: {
      width: 1160,
      height: 1160,
      channels: 3,
      background: bgColor,
    },
  });

  if (imageUrl) {
    const logoBuffer = await fetchImageBuffer(imageUrl);
    if (logoBuffer) {
      try {
        // Target size: 50% of 1160 = 580px (increased by 25% from 464px)
        const targetSize = 580;

        const resizedLogo = await sharp(logoBuffer)
          .resize(targetSize, targetSize, {
            fit: "inside",
            withoutEnlargement: false,
          })
          .png()
          .toBuffer();

        const logoMeta = await sharp(resizedLogo).metadata();
        const logoWidth = logoMeta.width || targetSize;
        const logoHeight = logoMeta.height || targetSize;

        const left = Math.round((1160 - logoWidth) / 2);
        const top = Math.round((1160 - logoHeight) / 2);

        const result = await baseImage
          .composite([{ input: resizedLogo, left, top }])
          .png()
          .toBuffer();

        return `data:image/png;base64,${result.toString("base64")}`;
      } catch (error) {
        console.error("Error compositing logo:", error);
      }
    }
  }

  const result = await baseImage.png().toBuffer();
  return `data:image/png;base64,${result.toString("base64")}`;
}

/**
 * Approach 2: 3D Wave pattern with accent color
 * Creates a more dramatic, layered 3D wave effect
 */
async function generateWavePatternImage(accentColor: string): Promise<string> {
  // Create color variations for 3D depth effect
  const baseColor = chroma(accentColor);
  const lightest = baseColor.brighten(1.5).hex();
  const lighter = baseColor.brighten(0.8).hex();
  const light = baseColor.brighten(0.3).hex();
  const dark = baseColor.darken(0.5).hex();
  const darker = baseColor.darken(1).hex();
  const darkest = baseColor.darken(1.5).hex();

  // Create SVG with 3D layered wave pattern
  const svg = `
    <svg width="1160" height="1160" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Main background gradient -->
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${darker};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${darkest};stop-opacity:1" />
        </linearGradient>

        <!-- Highlight gradient for top of waves -->
        <linearGradient id="waveHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${lightest};stop-opacity:1" />
          <stop offset="40%" style="stop-color:${lighter};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${accentColor};stop-opacity:1" />
        </linearGradient>

        <!-- Shadow gradient for wave depth -->
        <linearGradient id="waveShadow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:${accentColor};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${darker};stop-opacity:1" />
        </linearGradient>

        <!-- Glow filter for 3D effect -->
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- Dark background -->
      <rect width="1160" height="1160" fill="url(#bgGrad)"/>

      <!-- Back wave layer (furthest) -->
      <path d="M-100,750
               C200,650 400,850 580,750
               S900,650 1260,750
               L1260,1200 L-100,1200 Z"
            fill="${dark}" opacity="0.6"/>

      <!-- Middle-back wave -->
      <path d="M-100,800
               C150,700 350,900 580,800
               S850,700 1260,800
               L1260,1200 L-100,1200 Z"
            fill="${accentColor}" opacity="0.7"/>

      <!-- Middle wave with highlight -->
      <path d="M-100,850
               C100,750 300,950 580,850
               S900,750 1260,850
               L1260,1200 L-100,1200 Z"
            fill="url(#waveShadow)"/>

      <!-- Front wave highlight edge -->
      <path d="M-100,850
               C100,750 300,950 580,850
               S900,750 1260,850"
            fill="none"
            stroke="${lighter}"
            stroke-width="3"
            filter="url(#glow)"/>

      <!-- Front wave (closest) -->
      <path d="M-100,920
               C150,820 380,1020 600,920
               S950,820 1260,920
               L1260,1200 L-100,1200 Z"
            fill="url(#waveHighlight)"/>

      <!-- Front wave top highlight -->
      <path d="M-100,920
               C150,820 380,1020 600,920
               S950,820 1260,920"
            fill="none"
            stroke="${lightest}"
            stroke-width="4"
            filter="url(#glow)"/>

      <!-- Subtle top atmosphere -->
      <rect width="1160" height="400" fill="${lightest}" opacity="0.05"/>

      <!-- Ambient light spots -->
      <ellipse cx="300" cy="200" rx="250" ry="150" fill="${lighter}" opacity="0.08"/>
      <ellipse cx="900" cy="300" rx="200" ry="120" fill="${light}" opacity="0.06"/>
    </svg>
  `;

  const result = await sharp(Buffer.from(svg))
    .resize(1160, 1160)
    .png()
    .toBuffer();

  return `data:image/png;base64,${result.toString("base64")}`;
}

/**
 * Approach 4: Extend OG image to square by sampling edge colors and creating a seamless extension
 */
async function generateOgExtendedImage(ogImageUrl: string): Promise<string> {
  const buffer = await fetchImageBuffer(ogImageUrl);
  if (!buffer) {
    throw new Error("Failed to fetch OG image");
  }

  const image = sharp(buffer);
  const metadata = await image.metadata();
  const width = metadata.width || 1200;
  const height = metadata.height || 630;

  // Target is 1160x1160 square
  const targetSize = 1160;

  if (width === height) {
    // Already square, just resize
    const result = await image.resize(targetSize, targetSize).png().toBuffer();
    return `data:image/png;base64,${result.toString("base64")}`;
  }

  // Determine if we need to extend horizontally or vertically
  const isWide = width > height;

  // Get raw pixel data for edge sampling
  const { data, info } = await image
    .clone()
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  // Sample edge colors for extension
  const sampleEdgeColors = (
    rawData: Buffer,
    imgWidth: number,
    imgHeight: number,
    channels: number,
    edge: "top" | "bottom" | "left" | "right",
    sampleDepth: number = 5
  ): string[] => {
    const colors: string[] = [];

    if (edge === "top" || edge === "bottom") {
      const y = edge === "top" ? 0 : imgHeight - 1;
      for (let x = 0; x < imgWidth; x += Math.max(1, Math.floor(imgWidth / 20))) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = 0; dy < sampleDepth && (edge === "top" ? dy < imgHeight : y - dy >= 0); dy++) {
          const sampleY = edge === "top" ? dy : y - dy;
          const idx = (sampleY * imgWidth + x) * channels;
          r += rawData[idx];
          g += rawData[idx + 1];
          b += rawData[idx + 2];
          count++;
        }
        if (count > 0) {
          colors.push(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);
        }
      }
    } else {
      const x = edge === "left" ? 0 : imgWidth - 1;
      for (let y = 0; y < imgHeight; y += Math.max(1, Math.floor(imgHeight / 20))) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dx = 0; dx < sampleDepth && (edge === "left" ? dx < imgWidth : x - dx >= 0); dx++) {
          const sampleX = edge === "left" ? dx : x - dx;
          const idx = (y * imgWidth + sampleX) * channels;
          r += rawData[idx];
          g += rawData[idx + 1];
          b += rawData[idx + 2];
          count++;
        }
        if (count > 0) {
          colors.push(`rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`);
        }
      }
    }
    return colors;
  };

  // Calculate extension needed
  let newWidth: number, newHeight: number, offsetX: number, offsetY: number;
  let topColors: string[] = [], bottomColors: string[] = [];
  let leftColors: string[] = [], rightColors: string[] = [];

  if (isWide) {
    // Image is wider than tall - extend top and bottom
    const scaleFactor = targetSize / width;
    const scaledHeight = Math.round(height * scaleFactor);
    const extensionNeeded = targetSize - scaledHeight;
    const topExtension = Math.floor(extensionNeeded / 2);
    const bottomExtension = extensionNeeded - topExtension;

    newWidth = targetSize;
    newHeight = targetSize;
    offsetX = 0;
    offsetY = topExtension;

    // Sample top and bottom edges
    topColors = sampleEdgeColors(data, info.width, info.height, info.channels, "top", 10);
    bottomColors = sampleEdgeColors(data, info.width, info.height, info.channels, "bottom", 10);

    // Create gradient strips for top and bottom
    const avgTopColor = topColors.length > 0 ? topColors[Math.floor(topColors.length / 2)] : "rgb(128,128,128)";
    const avgBottomColor = bottomColors.length > 0 ? bottomColors[Math.floor(bottomColors.length / 2)] : "rgb(128,128,128)";

    // Resize original image
    const resizedImage = await image.resize(targetSize, scaledHeight).png().toBuffer();

    // Create SVG with gradient extensions
    const svg = `
      <svg width="${targetSize}" height="${targetSize}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="topGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            ${topColors.map((c, i) => `<stop offset="${(i / Math.max(1, topColors.length - 1)) * 100}%" style="stop-color:${c};stop-opacity:1" />`).join("")}
          </linearGradient>
          <linearGradient id="bottomGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            ${bottomColors.map((c, i) => `<stop offset="${(i / Math.max(1, bottomColors.length - 1)) * 100}%" style="stop-color:${c};stop-opacity:1" />`).join("")}
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${targetSize}" height="${topExtension + 10}" fill="url(#topGrad)"/>
        <rect x="0" y="${targetSize - bottomExtension - 10}" width="${targetSize}" height="${bottomExtension + 10}" fill="url(#bottomGrad)"/>
      </svg>
    `;

    const gradientBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    // Composite: gradient background + resized image
    const result = await sharp(gradientBuffer)
      .composite([{ input: resizedImage, top: offsetY, left: 0 }])
      .png()
      .toBuffer();

    return `data:image/png;base64,${result.toString("base64")}`;
  } else {
    // Image is taller than wide - extend left and right
    const scaleFactor = targetSize / height;
    const scaledWidth = Math.round(width * scaleFactor);
    const extensionNeeded = targetSize - scaledWidth;
    const leftExtension = Math.floor(extensionNeeded / 2);
    const rightExtension = extensionNeeded - leftExtension;

    newWidth = targetSize;
    newHeight = targetSize;
    offsetX = leftExtension;
    offsetY = 0;

    // Sample left and right edges
    leftColors = sampleEdgeColors(data, info.width, info.height, info.channels, "left", 10);
    rightColors = sampleEdgeColors(data, info.width, info.height, info.channels, "right", 10);

    // Resize original image
    const resizedImage = await image.resize(scaledWidth, targetSize).png().toBuffer();

    // Create SVG with gradient extensions
    const svg = `
      <svg width="${targetSize}" height="${targetSize}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="leftGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            ${leftColors.map((c, i) => `<stop offset="${(i / Math.max(1, leftColors.length - 1)) * 100}%" style="stop-color:${c};stop-opacity:1" />`).join("")}
          </linearGradient>
          <linearGradient id="rightGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            ${rightColors.map((c, i) => `<stop offset="${(i / Math.max(1, rightColors.length - 1)) * 100}%" style="stop-color:${c};stop-opacity:1" />`).join("")}
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${leftExtension + 10}" height="${targetSize}" fill="url(#leftGrad)"/>
        <rect x="${targetSize - rightExtension - 10}" y="0" width="${rightExtension + 10}" height="${targetSize}" fill="url(#rightGrad)"/>
      </svg>
    `;

    const gradientBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    // Composite: gradient background + resized image
    const result = await sharp(gradientBuffer)
      .composite([{ input: resizedImage, top: 0, left: offsetX }])
      .png()
      .toBuffer();

    return `data:image/png;base64,${result.toString("base64")}`;
  }
}

// ── Gradient debug type ──────────────────────────────────────────────
export interface GradientDebug {
  mode: "extracted" | "preset";
  angle: number;
  stops: string[];
  reason: string;
  presetName?: string;
  inputColors?: string[];
}

// ── Color helpers ────────────────────────────────────────────────────

/** { r, g, b } → "#rrggbb" */
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** RGB → HSL (h: 0–360, s: 0–1, l: 0–1) */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
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

/** HSL → RGB (h: 0–360, s: 0–1, l: 0–1) → (0–255 each) */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h /= 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/** Perceived luminance (0–1), used to sort stops light→dark */
function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Euclidean distance in RGB space (0–441) */
function colorDistance(a: string, b: string): number {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2);
}

/**
 * Clamp saturation: cap at maxS, boost lightness if too dark.
 * Returns a new hex color.
 */
function clampColor(hex: string, maxS = 0.75, minL = 0.25, maxL = 0.80): string {
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  const s = Math.min(hsl.s, maxS);
  const l = Math.max(minL, Math.min(maxL, hsl.l));
  const clamped = hslToRgb(hsl.h, s, l);
  return rgbToHex(clamped.r, clamped.g, clamped.b);
}

/**
 * Deduplicate colors that are visually very close (distance < 40).
 * Keeps the first occurrence.
 */
function deduplicateColors(colors: string[]): string[] {
  const result: string[] = [];
  for (const c of colors) {
    if (!result.some(existing => colorDistance(existing, c) < 40)) {
      result.push(c);
    }
  }
  return result;
}

// ── Curated preset palettes ──────────────────────────────────────────

interface GradientPreset {
  name: string;
  stops: string[];
}

const GRADIENT_PRESETS: GradientPreset[] = [
  { name: "sunset",        stops: ["#fbc2eb", "#f68084", "#a6475b"] },
  { name: "soft-blue",     stops: ["#e0f0ff", "#7fb3e0", "#3a6fa0"] },
  { name: "navy-depth",    stops: ["#c3cfe2", "#5b7fad", "#1a3260"] },
  { name: "lilac",         stops: ["#e8d5f5", "#b48ad8", "#6c3a8a"] },
  { name: "sage",          stops: ["#e8f0e4", "#8ab89a", "#3a6b4a"] },
  { name: "warm-sand",     stops: ["#fef3e2", "#e0b87a", "#8a6d3b"] },
  { name: "coral-rose",    stops: ["#fde2e4", "#e8878c", "#8a3a3d"] },
  { name: "arctic",        stops: ["#e4f1f8", "#7ec8e3", "#2d6f8e"] },
  { name: "slate",         stops: ["#ebedf0", "#8e99a4", "#3d4852"] },
  { name: "peach",         stops: ["#ffecd2", "#fcb69f", "#a8604a"] },
  { name: "mint",          stops: ["#d4f8e8", "#6cc9a1", "#2d7a56"] },
  { name: "lavender-mist", stops: ["#f0e6ff", "#c4a8e8", "#6a4a8a"] },
];

/**
 * Simple deterministic hash (djb2) for preset selection.
 * Must match the hash in hero-selector for consistency.
 */
function stableHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// ── Gradient angle from domain hash ──────────────────────────────────

/**
 * Pick a slight-diagonal angle between 165° and 195° (mostly vertical,
 * slight lean left or right) based on the domain hash.
 */
function pickAngle(domainHash: number): number {
  // 165–195 in integer steps
  return 165 + (domainHash % 31); // 0..30 → 165..195
}

// ── Color guardrails ─────────────────────────────────────────────────

interface NormalizedStops {
  stops: string[];
  usedPreset: boolean;
  presetName?: string;
  reason: string;
}

/**
 * Normalize input colors into 2–4 gradient stops.
 * - Dedup near-identical colors
 * - Clamp saturation/lightness
 * - Sort by luminance (lighter → darker for top-to-bottom feel)
 * - Fall back to preset if colors are unusable
 */
/**
 * Create a clean single-color pastel fill from a base color.
 * Lightens to ~85% luminance and desaturates slightly for a premium feel.
 */
function makePastelFill(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  const hsl = rgbToHsl(r, g, b);
  // Target: soft pastel at ~85% lightness, moderate saturation
  const pastelL = 0.85;
  const pastelS = Math.min(hsl.s, 0.45);
  const pastel = hslToRgb(hsl.h, pastelS, pastelL);
  return rgbToHex(pastel.r, pastel.g, pastel.b);
}

/**
 * Detect if input colors are "low-color" — muted, near-gray, or all
 * clustering around the same hue. These produce muddy multi-stop gradients
 * and should use a single dominant color pastel fill instead.
 */
function isLowColorPalette(colors: string[]): boolean {
  if (colors.length === 0) return true;
  // Check average saturation — if most colors are desaturated, it's low-color
  let totalSat = 0;
  for (const c of colors) {
    const { r, g, b } = hexToRgb(c);
    const hsl = rgbToHsl(r, g, b);
    totalSat += hsl.s;
  }
  const avgSat = totalSat / colors.length;
  return avgSat < 0.25;
}

function normalizeStops(
  inputColors: string[],
  domainHash: number
): NormalizedStops {
  // Step 1: Clean input
  const cleaned = inputColors
    .filter(c => /^#[0-9a-fA-F]{6}$/.test(c))
    .map(c => c.toLowerCase());

  if (cleaned.length === 0) {
    const preset = GRADIENT_PRESETS[domainHash % GRADIENT_PRESETS.length];
    return {
      stops: preset.stops,
      usedPreset: true,
      presetName: preset.name,
      reason: "no valid hex colors in input",
    };
  }

  // Step 2: Clamp saturation & lightness
  const clamped = cleaned.map(c => clampColor(c));

  // Step 3: Deduplicate similar colors
  const deduped = deduplicateColors(clamped);

  // Step 3.5: Low-color palette detection — for minimal brands like Assembly,
  // prefer a clean single-color pastel fill over muddy multi-stop blends.
  if (isLowColorPalette(cleaned)) {
    // Pick the most saturated input color as the base hue
    let bestColor = cleaned[0];
    let bestSat = 0;
    for (const c of cleaned) {
      const { r, g, b } = hexToRgb(c);
      const hsl = rgbToHsl(r, g, b);
      if (hsl.s > bestSat) {
        bestSat = hsl.s;
        bestColor = c;
      }
    }
    const pastel = makePastelFill(bestColor);
    return {
      stops: [pastel, pastel],
      usedPreset: false,
      reason: `low-color palette (avg sat < 0.25), single pastel fill from ${bestColor}`,
    };
  }

  if (deduped.length < 2) {
    // Only one unique color after dedup — check if it's usable
    const lum = luminance(deduped[0]);
    if (lum < 0.15 || lum > 0.92) {
      // Too dark or too light to make a gradient
      const preset = GRADIENT_PRESETS[domainHash % GRADIENT_PRESETS.length];
      return {
        stops: preset.stops,
        usedPreset: true,
        presetName: preset.name,
        reason: `single color after dedup (${deduped[0]}) is too ${lum < 0.15 ? "dark" : "light"}`,
      };
    }
    // Single usable color → clean pastel fill (not a gradient blend)
    const pastel = makePastelFill(deduped[0]);
    return {
      stops: [pastel, pastel],
      usedPreset: false,
      reason: "single color → pastel fill",
    };
  }

  // Step 4: Take up to 4 stops, sort by luminance (lighter first → darker bottom)
  const final = deduped.slice(0, 4);
  final.sort((a, b) => luminance(b) - luminance(a));

  // Step 5: Check spread — if all colors are too close in luminance,
  // use pastel fill from the most saturated color instead of a preset
  const lumRange = luminance(final[0]) - luminance(final[final.length - 1]);
  if (lumRange < 0.15) {
    // Find most saturated color for the pastel base
    let bestColor = final[0];
    let bestSat = 0;
    for (const c of final) {
      const { r, g, b } = hexToRgb(c);
      const hsl = rgbToHsl(r, g, b);
      if (hsl.s > bestSat) {
        bestSat = hsl.s;
        bestColor = c;
      }
    }
    const pastel = makePastelFill(bestColor);
    return {
      stops: [pastel, pastel],
      usedPreset: false,
      reason: `narrow lum range (${lumRange.toFixed(3)}), pastel fill from ${bestColor}`,
    };
  }

  // Step 6: Anti-muddy guard — when few stops (2-3) span a wide luminance
  // range, the dark end creates a muddy blend (e.g. light-blue → dark-teal).
  // Use the lightest stop as a clean pastel fill instead.
  if (final.length <= 3) {
    const darkest = final[final.length - 1];
    const darkLum = luminance(darkest);
    // If the darkest stop is very dark (< 0.35), the gradient will look muddy
    if (darkLum < 0.35) {
      const lightest = final[0];
      const pastel = makePastelFill(lightest);
      return {
        stops: [pastel, pastel],
        usedPreset: false,
        reason: `anti-muddy: darkest stop ${darkest} (lum ${darkLum.toFixed(2)}) would muddy blend, pastel from ${lightest}`,
      };
    }
  }

  return {
    stops: final,
    usedPreset: false,
    reason: `${final.length} stops from extracted colors, lum range ${lumRange.toFixed(2)}`,
  };
}

// ── SVG gradient builder ─────────────────────────────────────────────

/**
 * Convert CSS angle (deg, 0=up, clockwise) to SVG linearGradient
 * x1/y1/x2/y2 percentages.
 */
function angleToSvgCoords(angleDeg: number): { x1: string; y1: string; x2: string; y2: string } {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // SVG 0° = right, CSS 0° = up
  const x1 = Math.round(50 - Math.cos(rad) * 50);
  const y1 = Math.round(50 - Math.sin(rad) * 50);
  const x2 = Math.round(50 + Math.cos(rad) * 50);
  const y2 = Math.round(50 + Math.sin(rad) * 50);
  return {
    x1: `${x1}%`,
    y1: `${y1}%`,
    x2: `${x2}%`,
    y2: `${y2}%`,
  };
}

/**
 * Approach 3: Premium gradient from extracted colors.
 *
 * Style: smooth vertical/slight-diagonal fade, sorted by luminance
 * (lighter at top → darker at bottom). One very subtle radial glow
 * for depth. No blobs.
 *
 * Returns { imageUrl, debug } so callers can log/expose debug info.
 */
async function generateGradientImage(
  colors: string[],
  domain?: string
): Promise<{ imageUrl: string; debug: GradientDebug }> {
  const domainStr = domain || "unknown";
  const domainHash = stableHash(domainStr);

  // ── Normalize stops with guardrails ──
  const normalized = normalizeStops(colors, domainHash);
  const { stops } = normalized;

  // ── Pick angle (165–195°, mostly vertical with slight lean) ──
  const angle = pickAngle(domainHash);
  const coords = angleToSvgCoords(angle);

  // ── Build SVG stops ──
  const svgStops = stops
    .map((color, i) => {
      const pct = stops.length === 1 ? 0 : (i / (stops.length - 1)) * 100;
      return `<stop offset="${pct}%" stop-color="${color}" />`;
    })
    .join("\n          ");

  // Subtle radial glow: centered upper-third, uses the lightest stop
  const glowColor = stops[0]; // lightest (sorted lighter-first)

  const svg = `<svg width="1160" height="1160" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" ${Object.entries(coords).map(([k, v]) => `${k}="${v}"`).join(" ")}>
      ${svgStops}
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="28%" r="55%">
      <stop offset="0%" stop-color="${glowColor}" stop-opacity="0.08" />
      <stop offset="100%" stop-color="${glowColor}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1160" height="1160" fill="url(#g)" />
  <rect width="1160" height="1160" fill="url(#glow)" />
</svg>`;

  const result = await sharp(Buffer.from(svg))
    .resize(1160, 1160)
    .png()
    .toBuffer();

  const debug: GradientDebug = {
    mode: normalized.usedPreset ? "preset" : "extracted",
    angle,
    stops,
    reason: normalized.reason,
    ...(normalized.presetName && { presetName: normalized.presetName }),
    ...(normalized.usedPreset && { inputColors: colors }),
  };

  return {
    imageUrl: `data:image/png;base64,${result.toString("base64")}`,
    debug,
  };
}

/**
 * Extract prominent colors from multiple scraped images
 */
export async function extractColorsFromScrapedImages(
  scrapedImages: ScrapedImageInfo[]
): Promise<string[]> {
  const imagesToProcess = scrapedImages.slice(0, 5);

  // Download and extract colors from all images in parallel
  const results = await Promise.allSettled(
    imagesToProcess.map(async (img) => {
      const buffer = await fetchImageBuffer(img.url);
      if (!buffer) return [];
      return extractColorsWithDetails(buffer);
    })
  );

  // Aggregate colors from all settled results
  const allColors: Map<string, number> = new Map();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const colors = result.value;
    colors.slice(0, 3).forEach((c, idx) => {
      const weight = 3 - idx;
      allColors.set(c.color, (allColors.get(c.color) || 0) + weight);
    });
  }

  const sorted = Array.from(allColors.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color);

  return sorted.slice(0, 5);
}

/**
 * Description for Approach 1
 */
export function getLogoCenteredPrompt(backgroundColor: string): string {
  return `Solid ${backgroundColor} background with logo centered at 40% width.`;
}

/**
 * Description for Approach 2
 */
export function getAccentWavePrompt(accentColor: string): string {
  return `3D wave pattern using ${accentColor} with layered depth and highlights.`;
}

/**
 * Description for Approach 3
 */
export function getGradientPrompt(colors: string[]): string {
  return `Gradient using colors: ${colors.slice(0, 4).join(", ")}.`;
}

/**
 * Description for Approach 4
 */
export function getOgExtendedPrompt(): string {
  return `OG image extended to square by sampling edge colors.`;
}

/**
 * Generate the gradient image (exported for use as login/social image).
 * Returns both the image URL and debug info for SSE/console output.
 *
 * @param domain - Optional domain string for deterministic hash-based
 *                 angle and preset selection.
 */
export async function generateGradientImagePublic(
  colors: string[],
  domain?: string
): Promise<{ imageUrl: string; debug: GradientDebug }> {
  return generateGradientImage(colors, domain);
}

/**
 * Compute gradient debug info without generating the image.
 * Pure & synchronous — used by the streaming route to get debug
 * metadata without running Sharp again.
 */
export function computeGradientDebug(
  colors: string[],
  domain?: string
): GradientDebug {
  const domainStr = domain || "unknown";
  const domainHash = stableHash(domainStr);
  const normalized = normalizeStops(colors, domainHash);
  const angle = pickAngle(domainHash);

  return {
    mode: normalized.usedPreset ? "preset" : "extracted",
    angle,
    stops: normalized.stops,
    reason: normalized.reason,
    ...(normalized.presetName && { presetName: normalized.presetName }),
    ...(normalized.usedPreset && { inputColors: colors }),
  };
}

/**
 * Generate all four image approaches (all deterministic, no AI)
 */
export async function generateAllDalleImages(
  colors: PortalColorScheme,
  companyName: string,
  scrapedImages: ScrapedImageInfo[],
  logoCenteredInput: LogoCenteredInput,
  ogImageUrl?: string | null
): Promise<DalleGeneration[]> {
  // Extract background color from logo (preferred) or icon
  const imageForBackground = logoCenteredInput.logoUrl || logoCenteredInput.iconUrl;
  let backgroundColor = logoCenteredInput.backgroundColor;

  if (!backgroundColor && imageForBackground) {
    backgroundColor = await extractBackgroundColor(imageForBackground);
  }
  backgroundColor = backgroundColor || colors.sidebarBackground;

  // Extract colors from scraped images for gradient approach
  const gradientColors = await extractColorsFromScrapedImages(scrapedImages);
  const finalGradientColors = gradientColors.length > 0
    ? gradientColors
    : [colors.accent, colors.sidebarBackground];

  const generations: DalleGeneration[] = [
    {
      approach: "logo_centered",
      prompt: getLogoCenteredPrompt(backgroundColor),
      imageUrl: null,
      status: "pending",
    },
    {
      approach: "accent_wave",
      prompt: getAccentWavePrompt(colors.accent),
      imageUrl: null,
      status: "pending",
    },
    {
      approach: "gradient",
      prompt: getGradientPrompt(finalGradientColors),
      imageUrl: null,
      status: "pending",
    },
  ];

  // Add 4th approach only if OG image is available
  if (ogImageUrl) {
    generations.push({
      approach: "og_extended",
      prompt: getOgExtendedPrompt(),
      imageUrl: null,
      status: "pending",
    });
  }

  // Generate all images in parallel
  const imagePromises = [
    (async () => {
      try {
        const imageUrl = await generateLogoCenteredImage(
          logoCenteredInput.iconUrl,
          logoCenteredInput.logoUrl,
          backgroundColor!
        );
        return { ...generations[0], imageUrl, status: "complete" as const };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { ...generations[0], status: "error" as const, error: errorMessage };
      }
    })(),
    (async () => {
      try {
        const imageUrl = await generateWavePatternImage(colors.accent);
        return { ...generations[1], imageUrl, status: "complete" as const };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { ...generations[1], status: "error" as const, error: errorMessage };
      }
    })(),
    (async () => {
      try {
        const result = await generateGradientImage(finalGradientColors);
        return { ...generations[2], imageUrl: result.imageUrl, status: "complete" as const };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { ...generations[2], status: "error" as const, error: errorMessage };
      }
    })(),
  ];

  // Add 4th approach generation if OG image is available
  if (ogImageUrl) {
    imagePromises.push(
      (async () => {
        try {
          const imageUrl = await generateOgExtendedImage(ogImageUrl);
          return { ...generations[3], imageUrl, status: "complete" as const };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          return { ...generations[3], status: "error" as const, error: errorMessage };
        }
      })()
    );
  }

  const results = await Promise.allSettled(imagePromises);

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      ...generations[index],
      status: "error" as const,
      error: result.reason?.message || "Generation failed",
    };
  });
}

/**
 * Generate a single image for a specific approach
 */
export async function generateDalleForApproach(
  approach: DalleGeneration["approach"],
  colors: PortalColorScheme,
  companyName: string,
  scrapedImages: ScrapedImageInfo[],
  logoCenteredInput?: LogoCenteredInput,
  ogImageUrl?: string | null
): Promise<DalleGeneration> {
  try {
    switch (approach) {
      case "logo_centered": {
        const imageForBackground = logoCenteredInput?.logoUrl || logoCenteredInput?.iconUrl;
        let backgroundColor = logoCenteredInput?.backgroundColor || null;

        if (!backgroundColor && imageForBackground) {
          backgroundColor = await extractBackgroundColor(imageForBackground);
        }
        backgroundColor = backgroundColor || colors.sidebarBackground;

        const imageUrl = await generateLogoCenteredImage(
          logoCenteredInput?.iconUrl || null,
          logoCenteredInput?.logoUrl || null,
          backgroundColor
        );
        return {
          approach,
          prompt: getLogoCenteredPrompt(backgroundColor),
          imageUrl,
          status: "complete",
        };
      }
      case "accent_wave": {
        const imageUrl = await generateWavePatternImage(colors.accent);
        return {
          approach,
          prompt: getAccentWavePrompt(colors.accent),
          imageUrl,
          status: "complete",
        };
      }
      case "gradient": {
        const gradientColors = await extractColorsFromScrapedImages(scrapedImages);
        const finalColors = gradientColors.length > 0
          ? gradientColors
          : [colors.accent, colors.sidebarBackground];
        const { imageUrl } = await generateGradientImage(finalColors);
        return {
          approach,
          prompt: getGradientPrompt(finalColors),
          imageUrl,
          status: "complete",
        };
      }
      case "og_extended": {
        if (!ogImageUrl) {
          throw new Error("OG image URL is required for og_extended approach");
        }
        const imageUrl = await generateOgExtendedImage(ogImageUrl);
        return {
          approach,
          prompt: getOgExtendedPrompt(),
          imageUrl,
          status: "complete",
        };
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      approach,
      prompt: "",
      imageUrl: null,
      status: "error",
      error: errorMessage,
    };
  }
}

/**
 * Legacy function for backwards compatibility
 */
export async function generateLoginImage(
  colors: PortalColorScheme,
  companyName: string
): Promise<string> {
  return generateWavePatternImage(colors.accent);
}

/**
 * Always returns true now since we don't need OpenAI
 */
export function isOpenAIConfigured(): boolean {
  return true;
}
