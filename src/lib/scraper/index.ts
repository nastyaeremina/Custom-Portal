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
import { nameFromDomain } from "@/lib/utils/domain-name-splitter";

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
  const browser = await getBrowser();
  const page = await createPage(browser, url);

  try {
    // Helper: catch + log so extractor failures are never silent.
    const safe = <T>(label: string, promise: Promise<T>, fallback: T): Promise<T> =>
      promise.catch((err) => {
        console.error(`[scraper] ${label} failed:`, err?.message ?? err);
        return fallback;
      });

    // Run extractions in parallel where possible
    const [favicon, logo, ogImage, manifestData, heroImages, colorsWithUsage, linkButtonColors, navHeaderBackground, metadata, domNameCandidates, parkedResult] = await Promise.all([
      safe("extractFavicon", extractFavicon(page), null),
      safe("extractLogo", extractLogo(page), null),
      safe("extractOgImage", extractOgImage(page), null),
      safe("extractManifestData", extractManifestData(page), { icons: [] as string[], name: null, shortName: null }),
      safe("extractHeroImages", extractHeroImages(page), []),
      safe("extractColorsWithUsage", extractColorsWithUsage(page), []),
      safe("extractLinkButtonColors", extractLinkButtonColors(page), []),
      safe("extractNavHeaderBackground", extractNavHeaderBackground(page), null),
      safe("extractMetadata", extractMetadata(page), {
        title: null,
        description: null,
        meta: {},
      }),
      safe("extractCompanyNameCandidates", extractCompanyNameCandidates(page), []),
      safe("detectParkedDomain", detectParkedDomain(page, url), {
        isParked: false, score: 0, threshold: 50, signals: [] as string[],
      }),
    ]);

    // ── Merge manifest name/shortName into company-name candidates ──
    const companyNameCandidates: CompanyNameCandidate[] = [...domNameCandidates];
    if (manifestData.name) {
      companyNameCandidates.push({ value: manifestData.name, source: "manifest" });
    }
    if (manifestData.shortName && manifestData.shortName !== manifestData.name) {
      companyNameCandidates.push({ value: manifestData.shortName, source: "manifest" });
    }

    // ── Derive a candidate from the domain name ──
    // Helps when structured data (og:site_name, schema-org) is missing and the
    // page title is purely descriptive/SEO-focused (e.g. "Tulum Real Estate…").
    const domainName = nameFromDomain(url);
    if (domainName) {
      companyNameCandidates.push({ value: domainName, source: "domain" });
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
