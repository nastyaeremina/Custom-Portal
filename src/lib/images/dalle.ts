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
 * Approach 3: Gradient from extracted colors
 */
async function generateGradientImage(colors: string[]): Promise<string> {
  // Ensure we have at least 2 colors
  const colorList = colors.length >= 2 ? colors : [colors[0] || "#6366f1", colors[0] || "#8b5cf6"];

  // Take up to 4 colors for the gradient
  const gradientColors = colorList.slice(0, 4);

  // Create gradient stops
  const stops = gradientColors.map((color, index) => {
    const percentage = (index / (gradientColors.length - 1)) * 100;
    return `<stop offset="${percentage}%" style="stop-color:${color};stop-opacity:1" />`;
  }).join("\n");

  // Create SVG with multi-color gradient
  const svg = `
    <svg width="1160" height="1160" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="mainGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          ${stops}
        </linearGradient>
        <linearGradient id="overlayGrad" x1="100%" y1="0%" x2="0%" y2="100%">
          ${stops}
        </linearGradient>
        <radialGradient id="radialOverlay" cx="30%" cy="30%" r="70%">
          <stop offset="0%" style="stop-color:${gradientColors[0]};stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:${gradientColors[gradientColors.length - 1]};stop-opacity:0" />
        </radialGradient>
      </defs>

      <!-- Base diagonal gradient -->
      <rect width="1160" height="1160" fill="url(#mainGrad)"/>

      <!-- Overlay for depth -->
      <rect width="1160" height="1160" fill="url(#radialOverlay)"/>

      <!-- Subtle color blobs for organic feel -->
      <ellipse cx="300" cy="300" rx="400" ry="300" fill="${gradientColors[0]}" opacity="0.15"/>
      <ellipse cx="900" cy="800" rx="350" ry="400" fill="${gradientColors[gradientColors.length - 1]}" opacity="0.15"/>
      ${gradientColors.length > 2 ? `<ellipse cx="600" cy="600" rx="300" ry="300" fill="${gradientColors[1]}" opacity="0.1"/>` : ""}
    </svg>
  `;

  const result = await sharp(Buffer.from(svg))
    .resize(1160, 1160)
    .png()
    .toBuffer();

  return `data:image/png;base64,${result.toString("base64")}`;
}

/**
 * Extract prominent colors from multiple scraped images
 */
export async function extractColorsFromScrapedImages(
  scrapedImages: ScrapedImageInfo[]
): Promise<string[]> {
  const allColors: Map<string, number> = new Map();
  const imagesToProcess = scrapedImages.slice(0, 5);

  for (const img of imagesToProcess) {
    try {
      const buffer = await fetchImageBuffer(img.url);
      if (!buffer) continue;

      const colors = await extractColorsWithDetails(buffer);

      colors.slice(0, 3).forEach((c, idx) => {
        const weight = 3 - idx;
        allColors.set(c.color, (allColors.get(c.color) || 0) + weight);
      });
    } catch (error) {
      console.error(`Error extracting colors from ${img.url}:`, error);
    }
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
 * Generate the gradient image (exported for use as login/social image)
 */
export async function generateGradientImagePublic(colors: string[]): Promise<string> {
  return generateGradientImage(colors);
}

/**
 * Generate all three image approaches (all deterministic, no AI)
 */
export async function generateAllDalleImages(
  colors: PortalColorScheme,
  companyName: string,
  scrapedImages: ScrapedImageInfo[],
  logoCenteredInput: LogoCenteredInput
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

  // Generate all images in parallel
  const results = await Promise.allSettled([
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
        const imageUrl = await generateGradientImage(finalGradientColors);
        return { ...generations[2], imageUrl, status: "complete" as const };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return { ...generations[2], status: "error" as const, error: errorMessage };
      }
    })(),
  ]);

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
  logoCenteredInput?: LogoCenteredInput
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
        const imageUrl = await generateGradientImage(finalColors);
        return {
          approach,
          prompt: getGradientPrompt(finalColors),
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
