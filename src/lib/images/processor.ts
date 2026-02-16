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
 * Samples 8 points around the image periphery — four corners plus four
 * edge midpoints — on a 16×16 downscale.  This gives robust coverage
 * for logos that are contain-fit into a larger transparent square (where
 * corners alone might all be transparent).
 *
 * Selection logic:
 *   1. Collect all 8 samples.
 *   2. Separate opaque (alpha ≥ 200) from transparent samples.
 *   3. If ALL 8 are transparent → null (no background).
 *   4. Among opaque samples, cluster by colour similarity (Euclidean < 30).
 *   5. If the largest cluster has ≥ 5 of 8 opaque samples → solid background.
 *   6. Otherwise → null (gradient, multi-colour, or ambiguous).
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
    const SIZE = 16;
    const { data, info } = await sharp(buffer)
      .resize(SIZE, SIZE, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const ch = info.channels; // 4 (RGBA)

    // Early exit for predominantly transparent icons.
    // If ≥25% of the 16×16 grid is transparent, the icon has no solid
    // background — return null to avoid extracting anti-aliasing artifacts.
    let transparentCount = 0;
    const totalPixels = w * h;
    for (let i = 0; i < data.length; i += ch) {
      if (data[i + 3] < 128) transparentCount++;
    }
    if (transparentCount / totalPixels >= 0.25) return null;

    const mx = Math.floor(w / 2); // midpoint x
    const my = Math.floor(h / 2); // midpoint y

    // Sample 8 peripheral points: 4 corners + 4 edge midpoints
    const samplePoints = [
      [0, 0],           // top-left corner
      [w - 1, 0],       // top-right corner
      [0, h - 1],       // bottom-left corner
      [w - 1, h - 1],   // bottom-right corner
      [mx, 0],          // top-center
      [mx, h - 1],      // bottom-center
      [0, my],          // left-center
      [w - 1, my],      // right-center
    ];

    const samples: { r: number; g: number; b: number; a: number }[] = [];
    for (const [x, y] of samplePoints) {
      const idx = (y * w + x) * ch;
      samples.push({
        r: data[idx],
        g: data[idx + 1],
        b: data[idx + 2],
        a: data[idx + 3],
      });
    }

    // Separate opaque from transparent.
    // Threshold 100 (not 200) so rounded-corner anti-aliasing (alpha ~120)
    // is still counted — these pixels carry valid background colour info.
    const opaque = samples.filter(s => s.a >= 100);
    if (opaque.length === 0) return null; // Fully transparent

    // Group by similarity (Euclidean distance < 30)
    const toHex = (s: { r: number; g: number; b: number }) =>
      "#" +
      [s.r, s.g, s.b].map(c => c.toString(16).padStart(2, "0")).join("");

    const dist = (
      a: { r: number; g: number; b: number },
      b: { r: number; g: number; b: number }
    ) => Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);

    // Find the largest cluster of similar opaque samples
    let bestCluster: typeof opaque = [];
    for (let i = 0; i < opaque.length; i++) {
      const cluster = opaque.filter(s => dist(s, opaque[i]) < 30);
      if (cluster.length > bestCluster.length) {
        bestCluster = cluster;
      }
    }

    // Need at least 5 of 8 points to agree (was 3/4 — now more robust)
    if (bestCluster.length < 5) return null;

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
 * Extract the dominant non-transparent colour from a squareIcon data URL.
 *
 * This gives us the logo's primary foreground colour, which we can compare
 * against a proposed background to ensure sufficient contrast.
 *
 * Algorithm:
 *   1. Resize to 32×32 with alpha.
 *   2. Collect every pixel whose alpha ≥ 200 (opaque foreground).
 *   3. Quantise to 16-step buckets and find the most frequent colour.
 *   4. If no opaque foreground pixels → return null.
 *
 * Returns a hex string like "#2055a4" or null.
 */
export async function extractLogoDominantColor(
  dataUrl: string
): Promise<string | null> {
  try {
    const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
    if (!base64Match) return null;

    const buffer = Buffer.from(base64Match[1], "base64");
    const { data, info } = await sharp(buffer)
      .resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const ch = info.channels; // 4 (RGBA)
    const step = 16;
    const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

    for (let i = 0; i < data.length; i += ch) {
      const a = data[i + 3];
      if (a < 200) continue; // skip transparent pixels

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Skip near-white and near-black (likely background remnants, not brand color)
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      if (brightness > 240 || brightness < 15) continue;

      const qr = Math.round(r / step) * step;
      const qg = Math.round(g / step) * step;
      const qb = Math.round(b / step) * step;
      const key = `${qr},${qg},${qb}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.r += r;
        existing.g += g;
        existing.b += b;
        existing.count++;
      } else {
        buckets.set(key, { r, g, b, count: 1 });
      }
    }

    if (buckets.size === 0) return null;

    // Find the most frequent bucket
    let best: { r: number; g: number; b: number; count: number } | null = null;
    for (const bucket of buckets.values()) {
      if (!best || bucket.count > best.count) {
        best = bucket;
      }
    }

    if (!best || best.count < 5) return null; // Too few pixels → unreliable

    // Average the accumulated values
    const avgR = Math.round(best.r / best.count);
    const avgG = Math.round(best.g / best.count);
    const avgB = Math.round(best.b / best.count);

    return (
      "#" +
      [avgR, avgG, avgB].map((c) => c.toString(16).padStart(2, "0")).join("")
    );
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
