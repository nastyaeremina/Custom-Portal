import sharp from "sharp";

/**
 * Fetch image from URL and return as buffer
 */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BrandScraper/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * Resize image to specified dimensions
 */
export async function resizeImage(
  input: Buffer | string,
  width: number,
  height: number,
  fit: "cover" | "contain" | "fill" = "cover"
): Promise<Buffer> {
  const buffer = typeof input === "string" ? await fetchImageBuffer(input) : input;

  return sharp(buffer)
    .ensureAlpha()
    .resize(width, height, {
      fit,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/**
 * Absolute minimum source dimension (px).
 * Anything below this is a tracking pixel, spacer gif, or otherwise unusable.
 */
const MIN_ICON_SIZE = 16;

/** Above this threshold we resize to 300×300 to normalise large icons. */
const RESIZE_THRESHOLD = 128;

/**
 * Process square icon for display at 16–40 px in the portal UI.
 *
 * Sharp/libvips cannot read .ico files — they throw "unsupported image format".
 * If the image is an ICO, we try to extract the largest embedded PNG frame.
 * Modern ICOs often embed PNG data; older ones use BMP (we skip those).
 *
 * Sizing strategy:
 *   source ≥ 128 px → resize to 300×300 (normalise large icons, save bandwidth)
 *   source 16–127px → pass through at native resolution (just ensure PNG + alpha)
 *   source < 16 px  → reject (tracking pixels, spacer gifs)
 *
 * For small sources (< 128 px) we intentionally skip server-side resizing.
 * The browser scales the native image to 16–40 px in a single step, which
 * avoids the double-resampling blur that comes from upscaling on the server
 * and then downscaling in the browser.
 */
export async function processSquareIcon(imageUrl: string): Promise<string> {
  try {
    let buffer = await fetchImageBuffer(imageUrl);

    // ── ICO detection & extraction ─────────────────────────────────
    // ICO magic bytes: 00 00 01 00  (reserved=0, type=1)
    if (
      buffer.length > 6 &&
      buffer[0] === 0 &&
      buffer[1] === 0 &&
      buffer[2] === 1 &&
      buffer[3] === 0
    ) {
      const extracted = extractLargestPngFromIco(buffer);
      if (extracted) {
        buffer = extracted;
      } else {
        // ICO with only BMP frames — Sharp can't handle it
        console.warn("processSquareIcon: ICO has no embedded PNG frames, skipping:", imageUrl);
        return "";
      }
    }

    // ── Minimum resolution quality gate ────────────────────────────
    const meta = await sharp(buffer).metadata();
    const srcW = meta.width ?? 0;
    const srcH = meta.height ?? 0;
    const srcSize = Math.max(srcW, srcH);

    if (srcSize < MIN_ICON_SIZE) {
      console.warn(
        `processSquareIcon: source too small (${srcW}×${srcH}), skipping:`,
        imageUrl
      );
      return "";
    }

    // ── Large source: resize to 300×300 ──────────────────────────
    if (srcSize >= RESIZE_THRESHOLD) {
      const resized = await sharp(buffer)
        .ensureAlpha()
        .resize(300, 300, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
      return `data:image/png;base64,${resized.toString("base64")}`;
    }

    // ── Small source (16–127 px): pass through at native resolution ──
    // Just normalise to PNG with alpha — let the browser handle scaling.
    const passthrough = await sharp(buffer)
      .ensureAlpha()
      .png()
      .toBuffer();
    return `data:image/png;base64,${passthrough.toString("base64")}`;
  } catch (error) {
    console.error("Error processing square icon:", error);
    return "";
  }
}

/**
 * Extract the largest embedded PNG from an ICO file buffer.
 *
 * ICO format: 6-byte header + 16-byte directory entries.
 * Each entry points to image data that may be PNG (magic 89 50 4E 47)
 * or BMP.  We only extract PNG frames because Sharp can handle those.
 *
 * Returns the PNG buffer of the largest frame, or null if none found.
 */
function extractLargestPngFromIco(ico: Buffer): Buffer | null {
  const count = ico.readUInt16LE(4);
  let bestPng: Buffer | null = null;
  let bestSize = 0; // pixel dimension (width), 256 is max

  for (let i = 0; i < count; i++) {
    const dirOffset = 6 + i * 16;
    if (dirOffset + 16 > ico.length) break;

    const w = ico[dirOffset] || 256; // 0 encodes 256
    const dataSize = ico.readUInt32LE(dirOffset + 8);
    const dataOffset = ico.readUInt32LE(dirOffset + 12);

    if (dataOffset + dataSize > ico.length) continue;

    // PNG magic: 89 50 4E 47
    if (
      ico[dataOffset] === 0x89 &&
      ico[dataOffset + 1] === 0x50 &&
      ico[dataOffset + 2] === 0x4e &&
      ico[dataOffset + 3] === 0x47
    ) {
      if (w > bestSize) {
        bestSize = w;
        bestPng = ico.subarray(dataOffset, dataOffset + dataSize);
      }
    }
  }

  return bestPng;
}

/**
 * Extract the dominant background color from a processed squareIcon data URL.
 *
 * Samples the four corners of the 300×300 image.  If ≥ 3 corners share the
 * same colour (within a small tolerance) we treat that as the background.
 *
 * Returns a hex string like "#2c2c3e" or null when the background is
 * ambiguous / transparent.
 */
export async function extractSquareIconBg(
  dataUrl: string
): Promise<string | null> {
  try {
    const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!base64Match) return null;

    const buffer = Buffer.from(base64Match[1], "base64");
    const { data, info } = await sharp(buffer)
      .resize(10, 10, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const ch = info.channels; // 4 (RGBA)

    // Sample four corners
    const corners = [
      [0, 0],
      [w - 1, 0],
      [0, info.height - 1],
      [w - 1, info.height - 1],
    ];

    const samples: { r: number; g: number; b: number; a: number }[] = [];
    for (const [x, y] of corners) {
      const idx = (y * w + x) * ch;
      samples.push({
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        a: data[idx + 3],
      });
    }

    // Skip if any corner is transparent (alpha < 200)
    if (samples.some(s => s.a < 200)) return null;

    // Group by similarity (Euclidean distance < 30)
    const toHex = (s: { r: number; g: number; b: number }) =>
      "#" +
      [s.r, s.g, s.b].map(c => c.toString(16).padStart(2, "0")).join("");

    const dist = (
      a: { r: number; g: number; b: number },
      b: { r: number; g: number; b: number }
    ) => Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);

    // Find the largest cluster of similar corners
    let bestCluster: typeof samples = [];
    for (let i = 0; i < samples.length; i++) {
      const cluster = samples.filter(s => dist(s, samples[i]) < 30);
      if (cluster.length > bestCluster.length) {
        bestCluster = cluster;
      }
    }

    // Need at least 3 of 4 corners to agree
    if (bestCluster.length < 3) return null;

    // Average the cluster
    const avg = {
      r: Math.round(bestCluster.reduce((s, c) => s + c.r, 0) / bestCluster.length),
      g: Math.round(bestCluster.reduce((s, c) => s + c.g, 0) / bestCluster.length),
      b: Math.round(bestCluster.reduce((s, c) => s + c.b, 0) / bestCluster.length),
    };

    return toHex(avg);
  } catch {
    return null;
  }
}

/**
 * Process full logo (maintain aspect ratio, min height 180px)
 */
export async function processFullLogo(imageUrl: string): Promise<string> {
  try {
    const buffer = await fetchImageBuffer(imageUrl);

    // Get original dimensions
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width || 180;
    const originalHeight = metadata.height || 180;

    // Calculate new dimensions maintaining aspect ratio
    let newHeight = Math.max(180, originalHeight);
    let newWidth = Math.round((originalWidth / originalHeight) * newHeight);

    // Cap aspect ratio at 5:1
    if (newWidth / newHeight > 5) {
      newWidth = newHeight * 5;
    }

    const resized = await sharp(buffer)
      .resize(newWidth, newHeight, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();

    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch (error) {
    console.error("Error processing full logo:", error);
    return "";
  }
}

/**
 * Process login image (1160x1160)
 */
export async function processLoginImage(imageUrl: string): Promise<string> {
  try {
    const buffer = await fetchImageBuffer(imageUrl);
    const resized = await resizeImage(buffer, 1160, 1160, "cover");
    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch (error) {
    console.error("Error processing login image:", error);
    return "";
  }
}

/**
 * Process social sharing image (1200x630)
 */
export async function processSocialImage(imageUrl: string): Promise<string> {
  try {
    const buffer = await fetchImageBuffer(imageUrl);
    const resized = await resizeImage(buffer, 1200, 630, "cover");
    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch (error) {
    console.error("Error processing social image:", error);
    return "";
  }
}

/**
 * Get dimensions of an image from URL
 */
export async function getImageDimensions(
  imageUrl: string
): Promise<{ width: number; height: number } | null> {
  try {
    const buffer = await fetchImageBuffer(imageUrl);
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
    };
  } catch {
    return null;
  }
}
