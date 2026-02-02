import chroma from "chroma-js";
import sharp from "sharp";
import { ColorPalette } from "./types";

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
    console.error("Error extracting colors from image:", error);
    return {
      dominant: "#333333",
      palette: ["#333333"],
    };
  }
}

/**
 * Fetch image and extract colors
 */
export async function extractColorsFromUrl(
  imageUrl: string
): Promise<ColorPalette> {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BrandScraper/1.0)",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
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
