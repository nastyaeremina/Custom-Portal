import { getBrowser, createPage, closeBrowser } from "./browser";
import {
  extractFavicon,
  extractLogo,
  extractOgImage,
  extractManifestData,
  extractHeroImages,
  extractColorsWithUsage,
  extractLinkButtonColors,
  extractNavHeaderBackground,
  extractMetadata,
  extractCompanyNameCandidates,
  detectParkedDomain,
} from "./extractors";
import { CompanyNameCandidate, ScrapedData } from "./types";

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
  const browser = await getBrowser();
  const page = await createPage(browser, url);

  try {
    // Run extractions in parallel where possible
    const [favicon, logo, ogImage, manifestData, heroImages, colorsWithUsage, linkButtonColors, navHeaderBackground, metadata, domNameCandidates, parkedResult] = await Promise.all([
      extractFavicon(page).catch(() => null),
      extractLogo(page).catch(() => null),
      extractOgImage(page).catch(() => null),
      extractManifestData(page).catch(() => ({ icons: [] as string[], name: null, shortName: null })),
      extractHeroImages(page).catch(() => []),
      extractColorsWithUsage(page).catch(() => []),
      extractLinkButtonColors(page).catch(() => []),
      extractNavHeaderBackground(page).catch(() => null),
      extractMetadata(page).catch(() => ({
        title: null,
        description: null,
        meta: {},
      })),
      extractCompanyNameCandidates(page).catch(() => []),
      detectParkedDomain(page, url).catch(() => ({
        isParked: false, score: 0, threshold: 50, signals: [] as string[],
      })),
    ]);

    // ── Merge manifest name/shortName into company-name candidates ──
    const companyNameCandidates: CompanyNameCandidate[] = [...domNameCandidates];
    if (manifestData.name) {
      companyNameCandidates.push({ value: manifestData.name, source: "manifest" });
    }
    if (manifestData.shortName && manifestData.shortName !== manifestData.name) {
      companyNameCandidates.push({ value: manifestData.shortName, source: "manifest" });
    }

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
      manifestIcons: manifestData.icons,
      images: allImages,
      colors: colorsWithUsage.map(c => c.color),
      colorsWithUsage,
      linkButtonColors,
      navHeaderBackground,
      meta: metadata.meta,
      companyNameCandidates,
      isParkedDomain: parkedResult.isParked,
      parkedDomainSignals: {
        score: parkedResult.score,
        threshold: parkedResult.threshold,
        signals: parkedResult.signals,
      },
    };
  } finally {
    await page.close();
  }
}

export { closeBrowser };
export type { ScrapedData };
