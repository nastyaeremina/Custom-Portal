import { NextRequest, NextResponse } from "next/server";
import { GenerateRequestSchema, GenerateResponse, PortalData, RawOutputs } from "@/types/api";
import { scrapeWebsite, closeBrowser } from "@/lib/scraper";
import { parseInput } from "@/lib/utils/url";
import { cleanCompanyName } from "@/lib/utils/company-name";
import { extractColorsFromUrl } from "@/lib/colors/extractor";
import { generateValidatedColorScheme, selectAccentColorWithContext, selectSidebarColors } from "@/lib/colors/generator";
import {
  processSquareIcon,
  extractSquareIconBg,
  processFullLogo,
  processLoginImage,
  processSocialImage,
} from "@/lib/images/processor";
import { isOpenAIConfigured, generateGradientImagePublic, extractColorsFromScrapedImages, type GradientDebug } from "@/lib/images/dalle";
import { detectDiscipline, selectHeroImage } from "@/lib/discipline";

export const maxDuration = 60; // Allow up to 60 seconds

export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
  try {
    // 1. Parse and validate input
    const body = await request.json();
    const { input } = GenerateRequestSchema.parse(body);

    // 2. Convert input to URL
    const targetUrl = parseInput(input);

    // 3. Scrape website
    console.log(`Scraping ${targetUrl}...`);
    const scrapedData = await scrapeWebsite(targetUrl);

    // 4. Extract colors from favicon/logo for palette (used for debug display)
    let imageColors: string[] = [];
    const colorSource = scrapedData.favicon || scrapedData.logo;
    if (colorSource) {
      try {
        const palette = await extractColorsFromUrl(colorSource);
        imageColors = palette.palette;
      } catch (error) {
        console.error("Error extracting colors from image:", error);
      }
    }

    // 5. Select accent color WITH context (extracts both favicon and logo saturation)
    const accentSelection = await selectAccentColorWithContext({
      squareIconUrl: scrapedData.favicon,
      logoUrl: scrapedData.logo,
      linkButtonColors: scrapedData.linkButtonColors,
    });

    const accentResult = accentSelection.result;

    // 6. Build extracted colors list for quality gate context
    const allExtractedColors = [
      ...scrapedData.colors,
      ...(scrapedData.linkButtonColors || []),
    ];

    // 7. Generate VALIDATED color scheme with quality gate
    const validatedColors = generateValidatedColorScheme(
      scrapedData.navHeaderBackground,
      accentResult,
      {
        faviconSaturation: accentSelection.faviconSaturation,
        logoSaturation: accentSelection.logoSaturation,
        linkButtonColors: scrapedData.linkButtonColors || [],
        allExtractedColors,
      }
    );

    // Extract the final colors for use
    const colors = {
      sidebarBackground: validatedColors.sidebarBackground,
      sidebarText: validatedColors.sidebarText,
      accent: validatedColors.accent,
    };

    // Get sidebar source for debug info
    const sidebarResult = selectSidebarColors({
      navHeaderBackground: scrapedData.navHeaderBackground,
      accentColor: accentResult.color,
    });

    // ── Discipline detection ──────────────────────────────────────
    const disciplineResult = detectDiscipline({
      url: targetUrl,
      title: scrapedData.title,
      description: scrapedData.description,
      meta: scrapedData.meta,
    });

    const heroSelection = selectHeroImage(disciplineResult, targetUrl);

    console.log(
      `[discipline] ${targetUrl} → ${disciplineResult.discipline} ` +
      `(confidence: ${disciplineResult.confidence}, signals: [${disciplineResult.signals.join(", ")}]) ` +
      `→ hero: ${heroSelection.selected ? heroSelection.imageUrl : "SKIP → gradient fallback"} ` +
      `(${heroSelection.reason})`
    );

    // 8. Process images
    let squareIcon: string | null = null;
    let squareIconBg: string | null = null;
    let fullLogo: string | null = null;
    let socialImage: string | null = null;
    let dalleImageUrl: string | null = null;

    // Login image: library takes priority, gradient is fallback
    let loginImage: string | null = heroSelection.selected ? heroSelection.imageUrl : null;
    let loginImageSource: string = heroSelection.selected ? "library" : "gradient";

    // Process square icon (from favicon) + extract dominant background
    if (scrapedData.favicon) {
      try {
        squareIcon = await processSquareIcon(scrapedData.favicon);
        if (squareIcon) {
          squareIconBg = await extractSquareIconBg(squareIcon);
        }
      } catch (error) {
        console.error("Error processing square icon:", error);
      }
    }

    // Process full logo
    if (scrapedData.logo) {
      try {
        fullLogo = await processFullLogo(scrapedData.logo);
      } catch (error) {
        console.error("Error processing full logo:", error);
      }
    }

    // Generate gradient image for login (approach 3)
    const scrapedImagesInfo = scrapedData.images.map(img => ({
      url: img.url,
      width: img.width,
      height: img.height,
      type: img.type,
    }));

    let gradientDebugInfo: GradientDebug | undefined;

    // Extract domain for deterministic gradient hashing
    let domain = "unknown";
    try { domain = new URL(targetUrl).hostname.replace(/^www\./, ""); } catch { /* ignore */ }

    if (isOpenAIConfigured()) {
      try {
        console.log("Generating gradient image...");
        // Extract colors from scraped images for gradient
        const gradientColors = await extractColorsFromScrapedImages(scrapedImagesInfo);
        const finalColors = gradientColors.length > 0
          ? gradientColors
          : [colors.accent, colors.sidebarBackground];
        const gradientResult = await generateGradientImagePublic(finalColors, domain);
        dalleImageUrl = gradientResult.imageUrl;
        gradientDebugInfo = gradientResult.debug;

        console.log(
          `[gradient] ${domain} → mode: ${gradientResult.debug.mode}, ` +
          `angle: ${gradientResult.debug.angle}°, stops: [${gradientResult.debug.stops.join(", ")}] ` +
          `(${gradientResult.debug.reason})`
        );

        // Use gradient for login only if discipline library didn't provide one
        if (!loginImage) {
          loginImage = dalleImageUrl;
          loginImageSource = "gradient";
        }
      } catch (error) {
        console.error("Error generating gradient image:", error);
      }
    }

    // Process social image (prefer scraped OG image, otherwise use gradient)
    if (scrapedData.ogImage) {
      try {
        socialImage = await processSocialImage(scrapedData.ogImage);
      } catch (error) {
        console.error("Error processing social image:", error);
      }
    } else if (dalleImageUrl) {
      // Use gradient image as social image if no OG image available
      try {
        socialImage = await processSocialImage(dalleImageUrl);
      } catch (error) {
        console.error("Error processing gradient image for social:", error);
      }
    }

    // 9. Clean company name
    const companyName = cleanCompanyName(
      scrapedData.meta["og:site_name"] ||
      scrapedData.meta["og:title"] ||
      scrapedData.title
    );

    // 10. Build response
    const portalData: PortalData = {
      companyName,
      colors,
      images: {
        squareIcon,
        squareIconBg,
        fullLogo,
        loginImage,
        dashboardImage: dalleImageUrl,
        socialImage,
        rawFaviconUrl: scrapedData.favicon,
        rawLogoUrl: scrapedData.logo,
      },
    };

    const rawOutputs: RawOutputs = {
      scrapedColors: scrapedData.colorsWithUsage,
      scrapedImages: scrapedData.images.map(img => ({
        url: img.url,
        width: img.width,
        height: img.height,
        type: img.type,
      })),
      extractedMeta: scrapedData.meta,
      colorThiefPalette: imageColors,
      generatedWithDalle: dalleImageUrl !== null,
      faviconUrl: scrapedData.favicon,
      logoUrl: scrapedData.logo,
      dalleImageUrl,
      accentColorSource: accentResult.source,
      accentColorConfidence: accentResult.isHighConfidence ? "high" : "low",
      navHeaderBackground: scrapedData.navHeaderBackground,
      sidebarColorSource: sidebarResult.source,
      qualityGateResult: {
        passed: validatedColors.qualityGate.passed,
        checks: validatedColors.qualityGate.checks,
        adjustments: validatedColors.qualityGate.adjustments,
        iterations: validatedColors.qualityGate.iterations,
        originalColors: validatedColors.qualityGate.originalColors,
      },
      accentPromotion: validatedColors.accentPromotion,
      disciplineDetection: {
        discipline: disciplineResult.discipline,
        confidence: disciplineResult.confidence,
        signals: disciplineResult.signals,
        heroSelection: {
          selected: heroSelection.selected,
          imageUrl: heroSelection.imageUrl,
          reason: heroSelection.reason,
          availableCount: heroSelection.availableCount,
          chosenIndex: heroSelection.chosenIndex,
        },
        loginImageSource,
      },
      gradientDebug: gradientDebugInfo,
    };

    return NextResponse.json({
      success: true,
      data: portalData,
      rawOutputs,
    });

  } catch (error) {
    console.error("Error in generate API:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  } finally {
    // Clean up browser
    try {
      await closeBrowser();
    } catch {
      // Ignore cleanup errors
    }
  }
}
