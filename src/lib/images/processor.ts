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
    .resize(width, height, {
      fit,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
}

/**
 * Process square icon (300x300)
 */
export async function processSquareIcon(imageUrl: string): Promise<string> {
  try {
    const buffer = await fetchImageBuffer(imageUrl);
    const resized = await resizeImage(buffer, 300, 300, "contain");
    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch (error) {
    console.error("Error processing square icon:", error);
    return "";
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
