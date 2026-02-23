import { put } from "@vercel/blob";

/**
 * Upload a base64 data URL to Vercel Blob and return the public URL.
 *
 * Returns `null` if the input is null/empty or if blob storage is not configured
 * (missing BLOB_READ_WRITE_TOKEN).
 */
export async function uploadDataUrl(
  dataUrl: string | null,
  pathname: string
): Promise<string | null> {
  if (!dataUrl) return null;

  // Skip non-data-URLs (already a URL or local path) — pass through as-is
  if (!dataUrl.startsWith("data:")) return dataUrl;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.warn("[blob-upload] BLOB_READ_WRITE_TOKEN not set, returning data URL as-is");
    return dataUrl;
  }

  try {
    // Parse the data URL: data:[<mediatype>][;base64],<data>  OR  data:[<mediatype>],<data>
    const base64Match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    const plainMatch = !base64Match ? dataUrl.match(/^data:([^;,]+),(.+)$/) : null;

    if (!base64Match && !plainMatch) {
      console.warn(`[blob-upload] Could not parse data URL for ${pathname}`);
      return dataUrl;
    }

    const contentType = (base64Match ?? plainMatch)![1];
    const rawData = (base64Match ?? plainMatch)![2];
    const buffer = base64Match
      ? Buffer.from(rawData, "base64")
      : Buffer.from(decodeURIComponent(rawData), "utf-8");

    const blob = await put(pathname, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: true,
    });

    return blob.url;
  } catch (error) {
    console.error(`[blob-upload] Failed to upload ${pathname}:`, error);
    return dataUrl; // fallback to data URL on failure
  }
}

/**
 * Upload all image fields from PortalImages to Vercel Blob.
 *
 * Takes a domain slug (e.g. "assembly") for organized pathname prefixes.
 * Returns a new images object with data URLs replaced by public blob URLs.
 */
export async function uploadPortalImages(
  images: {
    squareIcon: string | null;
    squareIconBg: string | null;
    logoDominantColor: string | null;
    squareIconFg: "dark" | "light" | null;
    fullLogo: string | null;
    loginImage: string | null;
    loginImageOrientation: "landscape" | "portrait" | "square" | null;
    loginImageType: "text_heavy" | "photo" | null;
    loginImageEdgeColor: string | null;
    loginGradientImage: string | null;
    dashboardImage: string | null;
    socialImage: string | null;
    rawFaviconUrl: string | null;
    rawLogoUrl: string | null;
  },
  domain: string
): Promise<typeof images> {
  // Only upload fields that are data URLs — skip hex colors, enums, and already-URL fields
  const prefix = `customize/${domain}`;

  const [
    squareIcon,
    fullLogo,
    loginImage,
    loginGradientImage,
    dashboardImage,
    socialImage,
    rawLogoUrl,
  ] = await Promise.all([
    uploadDataUrl(images.squareIcon, `${prefix}/square-icon.png`),
    uploadDataUrl(images.fullLogo, `${prefix}/full-logo.png`),
    uploadDataUrl(images.loginImage, `${prefix}/login-image.png`),
    uploadDataUrl(images.loginGradientImage, `${prefix}/login-gradient.png`),
    uploadDataUrl(images.dashboardImage, `${prefix}/dashboard-image.png`),
    uploadDataUrl(images.socialImage, `${prefix}/social-image.png`),
    uploadDataUrl(images.rawLogoUrl, `${prefix}/raw-logo.png`),
  ]);

  return {
    ...images,
    squareIcon,
    fullLogo,
    loginImage,
    loginGradientImage,
    dashboardImage,
    socialImage,
    rawLogoUrl,
    // These are already non-data-URL values — pass through unchanged:
    // squareIconBg, logoDominantColor, squareIconFg,
    // loginImageOrientation, loginImageType, loginImageEdgeColor,
    // rawFaviconUrl
  };
}
