import { getBrowser, createPage, closeBrowser } from "./browser";
import {
  extractFavicon,
  extractLogo,
  extractOgImage,
  extractHeroImages,
  extractColors,
  extractMetadata,
} from "./extractors";
import { ScrapedData } from "./types";

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
  const browser = await getBrowser();
  const page = await createPage(browser, url);

  try {
    // Run extractions in parallel where possible
    const [favicon, logo, ogImage, heroImages, colors, metadata] = await Promise.all([
      extractFavicon(page).catch(() => null),
      extractLogo(page).catch(() => null),
      extractOgImage(page).catch(() => null),
      extractHeroImages(page).catch(() => []),
      extractColors(page).catch(() => []),
      extractMetadata(page).catch(() => ({
        title: null,
        description: null,
        meta: {},
      })),
    ]);

    // Combine all images
    const allImages = [
      ...(favicon ? [{ url: favicon, type: "favicon" as const }] : []),
      ...(logo ? [{ url: logo, type: "logo" as const }] : []),
      ...(ogImage ? [{ url: ogImage, type: "og" as const }] : []),
      ...heroImages,
    ];

    return {
      url,
      title: metadata.title,
      description: metadata.description,
      favicon,
      logo,
      ogImage,
      images: allImages,
      colors,
      meta: metadata.meta,
    };
  } finally {
    await page.close();
  }
}

export { closeBrowser };
export type { ScrapedData };
