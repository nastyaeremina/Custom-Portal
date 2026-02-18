import chroma from "chroma-js";
import sharp from "sharp";
import { ColorPalette } from "./types";
import { fetchImageBuffer } from "../images/processor";

export interface ExtractedAccentColor {
  color: string;
  pixelCount: number;
  saturation: number;
  isHighConfidence: boolean;
}

/**
 * Check if a color is white, black, or gray (low saturation)
 */
export function isNeutralColor(hex: string): boolean {
  try {
    const c = chroma(hex);
    const [, s, l] = c.hsl();
    const saturation = isNaN(s) ? 0 : s;

    // Pure white or near-white
    if (l > 0.95) return true;
    // Pure black or near-black
    if (l < 0.05) return true;
    // Gray (low saturation < 10%)
    if (saturation < 0.1) return true;

    return false;
  } catch {
    return true;
  }
}

/**
 * Extract dominant colors from an image using Sharp
 */
export async function extractColorsFromImage(
  imageBuffer: Buffer
): Promise<ColorPalette> {
  try {
    // Resize to small size for faster processing
    const resized = await sharp(imageBuffer)
      .resize(50, 50, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;
    const pixels: Array<[number, number, number]> = [];

    // Collect all pixels
    for (let i = 0; i < data.length; i += info.channels) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }

    // Simple color quantization using k-means-like approach
    const colorCounts = new Map<string, number>();

    pixels.forEach(([r, g, b]) => {
      // Quantize to reduce color space
      const qr = Math.round(r / 32) * 32;
      const qg = Math.round(g / 32) * 32;
      const qb = Math.round(b / 32) * 32;
      const key = `${qr},${qg},${qb}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    });

    // Sort by frequency
    const sortedColors = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key]) => {
        const [r, g, b] = key.split(",").map(Number);
        return chroma(r, g, b).hex();
      });

    return {
      dominant: sortedColors[0] || "#333333",
      palette: sortedColors,
    };
  } catch (error) {
    // ICO / unsupported formats are common (e.g. favicon.ico) — log quietly
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("unsupported image format")) {
      console.warn("[extractColorsFromImage] Skipping unsupported image format (likely ICO)");
    } else {
      console.error("Error extracting colors from image:", error);
    }
    return {
      dominant: "#333333",
      palette: ["#333333"],
    };
  }
}

/**
 * Extract colors from image with detailed info for accent selection
 * Uses finer quantization to preserve brand colors better
 */
export async function extractColorsWithDetails(
  imageBuffer: Buffer
): Promise<ExtractedAccentColor[]> {
  try {
    const resized = await sharp(imageBuffer)
      .resize(100, 100, { fit: "cover" }) // Larger size for better color sampling
      .removeAlpha() // Remove alpha channel to avoid transparent pixels
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = resized;
    const colorCounts = new Map<string, number>();

    // Collect all pixels with counts
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Finer quantization (16 instead of 32) to preserve colors better
      const qr = Math.round(r / 16) * 16;
      const qg = Math.round(g / 16) * 16;
      const qb = Math.round(b / 16) * 16;
      const key = `${qr},${qg},${qb}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }

    // Convert to ExtractedAccentColor array
    const colors: ExtractedAccentColor[] = Array.from(colorCounts.entries())
      .map(([key, count]) => {
        const [r, g, b] = key.split(",").map(Number);
        const hex = chroma(r, g, b).hex();
        const [, s] = chroma(hex).hsl();
        const saturation = isNaN(s) ? 0 : s;

        return {
          color: hex,
          pixelCount: count,
          saturation,
          // High confidence if saturation > 30%
          isHighConfidence: saturation > 0.3,
        };
      })
      // Filter out neutral colors (white, black, grays with saturation < 10%)
      .filter(c => !isNeutralColor(c.color))
      // Sort by saturation * pixelCount to favor vibrant colors that appear frequently
      .sort((a, b) => {
        // Weight saturation heavily to prioritize vibrant colors
        const scoreA = a.saturation * Math.sqrt(a.pixelCount);
        const scoreB = b.saturation * Math.sqrt(b.pixelCount);
        return scoreB - scoreA;
      });

    console.log(`[extractColorsWithDetails] Found ${colors.length} non-neutral colors from image`);
    if (colors.length > 0) {
      console.log(`[extractColorsWithDetails] Top color: ${colors[0].color}, saturation: ${colors[0].saturation.toFixed(2)}, pixels: ${colors[0].pixelCount}`);
    }

    return colors;
  } catch (error) {
    // ICO / unsupported formats are common (e.g. favicon.ico) — log quietly
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("unsupported image format")) {
      console.warn("[extractColorsWithDetails] Skipping unsupported image format (likely ICO)");
    } else {
      console.error("Error extracting colors with details:", error);
    }
    return [];
  }
}

/**
 * Extract accent color candidate from image URL
 * Returns the top non-neutral color with saturation info
 */
export async function extractAccentFromImageUrl(
  imageUrl: string
): Promise<ExtractedAccentColor | null> {
  // Handle data URLs (SVGs)
  if (imageUrl.startsWith("data:")) {
    console.log(`[extractAccentFromImageUrl] Processing data URL (${imageUrl.substring(0, 50)}...)`);
    try {
      // For SVG data URLs, we need to extract the SVG content
      if (imageUrl.startsWith("data:image/svg+xml")) {
        // Decode the SVG and extract fill/stroke colors
        const svgContent = decodeURIComponent(imageUrl.replace("data:image/svg+xml,", ""));
        const colors = extractColorsFromSvg(svgContent);
        if (colors.length > 0) {
          console.log(`[extractAccentFromImageUrl] Found ${colors.length} colors from SVG`);
          return colors[0];
        }
        console.log(`[extractAccentFromImageUrl] No colors found in SVG`);
        return null;
      }

      // For other data URLs (base64 encoded images)
      const base64Match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match) {
        const buffer = Buffer.from(base64Match[2], "base64");
        console.log(`[extractAccentFromImageUrl] Decoded base64 image: ${buffer.length} bytes`);
        const colors = await extractColorsWithDetails(buffer);
        if (colors.length === 0) {
          console.log(`[extractAccentFromImageUrl] No non-neutral colors found in data URL image`);
          return null;
        }
        return colors[0];
      }

      console.log(`[extractAccentFromImageUrl] Unsupported data URL format`);
      return null;
    } catch (error) {
      console.error("[extractAccentFromImageUrl] Error processing data URL:", error);
      return null;
    }
  }

  console.log(`[extractAccentFromImageUrl] Fetching image: ${imageUrl}`);

  try {
    const buffer = await fetchImageBuffer(imageUrl);

    console.log(`[extractAccentFromImageUrl] Image buffer size: ${buffer.length} bytes`);

    if (buffer.length === 0) {
      console.error(`[extractAccentFromImageUrl] Empty image buffer`);
      return null;
    }

    // Check if buffer is SVG (text-based)
    const head = buffer.subarray(0, 256).toString("utf8");
    if (head.includes("<svg") || head.includes("<?xml")) {
      const colors = extractColorsFromSvg(buffer.toString("utf8"));
      if (colors.length > 0) {
        console.log(`[extractAccentFromImageUrl] Found ${colors.length} colors from SVG`);
        return colors[0];
      }
      console.log(`[extractAccentFromImageUrl] No colors found in SVG`);
      return null;
    }

    const colors = await extractColorsWithDetails(buffer);

    if (colors.length === 0) {
      console.log(`[extractAccentFromImageUrl] No non-neutral colors found in image`);
      return null;
    }

    console.log(`[extractAccentFromImageUrl] Returning top color: ${colors[0].color}`);
    return colors[0];
  } catch (error) {
    console.error("[extractAccentFromImageUrl] Error:", error);
    return null;
  }
}

/**
 * Extract colors from SVG content by parsing fill and stroke attributes
 */
function extractColorsFromSvg(svgContent: string): ExtractedAccentColor[] {
  const colors: ExtractedAccentColor[] = [];
  const colorCounts = new Map<string, number>();

  // Match hex colors (#rgb, #rrggbb)
  const hexMatches = svgContent.match(/#[0-9a-fA-F]{3,6}(?![0-9a-fA-F])/g) || [];

  // Match rgb/rgba colors
  const rgbMatches = svgContent.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g) || [];

  // Match named colors in fill/stroke attributes
  const namedColorPattern = /(?:fill|stroke|color)\s*[=:]\s*["']?([a-zA-Z]+)["']?/gi;
  let match;
  while ((match = namedColorPattern.exec(svgContent)) !== null) {
    const colorName = match[1].toLowerCase();
    // Skip 'none', 'transparent', 'inherit', 'currentColor', etc.
    if (!["none", "transparent", "inherit", "currentcolor", "initial"].includes(colorName)) {
      try {
        const hex = chroma(colorName).hex();
        colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
      } catch {
        // Invalid color name, skip
      }
    }
  }

  // Process hex colors
  hexMatches.forEach((hex) => {
    try {
      const normalized = chroma(hex).hex();
      colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1);
    } catch {
      // Invalid color, skip
    }
  });

  // Process rgb colors
  rgbMatches.forEach((rgb) => {
    try {
      const hex = chroma(rgb).hex();
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    } catch {
      // Invalid color, skip
    }
  });

  // Convert to ExtractedAccentColor array
  for (const [hex, count] of colorCounts.entries()) {
    if (isNeutralColor(hex)) continue;

    const [, s] = chroma(hex).hsl();
    const saturation = isNaN(s) ? 0 : s;

    colors.push({
      color: hex,
      pixelCount: count,
      saturation,
      isHighConfidence: saturation > 0.3,
    });
  }

  // Sort by saturation * count
  colors.sort((a, b) => {
    const scoreA = a.saturation * Math.sqrt(a.pixelCount);
    const scoreB = b.saturation * Math.sqrt(b.pixelCount);
    return scoreB - scoreA;
  });

  return colors;
}

/**
 * Fetch image and extract colors
 */
export async function extractColorsFromUrl(
  imageUrl: string
): Promise<ColorPalette> {
  try {
    const buffer = await fetchImageBuffer(imageUrl);
    return extractColorsFromImage(buffer);
  } catch (error) {
    console.error("Error fetching image for color extraction:", error);
    return {
      dominant: "#333333",
      palette: ["#333333"],
    };
  }
}

/**
 * Filter colors to find vibrant, saturated colors suitable for branding
 */
export function filterBrandColors(colors: string[]): string[] {
  return colors.filter((color) => {
    try {
      const c = chroma(color);
      const [, s, l] = c.hsl();

      // Filter out:
      // - Very desaturated colors (grays)
      // - Very light colors (near white)
      // - Very dark colors (near black)
      const saturation = isNaN(s) ? 0 : s;
      return saturation > 0.15 && l > 0.1 && l < 0.9;
    } catch {
      return false;
    }
  });
}

/**
 * Sort colors by vibrancy/saturation
 */
export function sortByVibrancy(colors: string[]): string[] {
  return [...colors].sort((a, b) => {
    try {
      const aHsl = chroma(a).hsl();
      const bHsl = chroma(b).hsl();
      const aSat = isNaN(aHsl[1]) ? 0 : aHsl[1];
      const bSat = isNaN(bHsl[1]) ? 0 : bHsl[1];
      return bSat - aSat;
    } catch {
      return 0;
    }
  });
}
