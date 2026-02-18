import { NextRequest, NextResponse } from "next/server";
import { GenerateRequestSchema, GenerateResponse, PortalData, RawOutputs } from "@/types/api";
import { scrapeWebsite } from "@/lib/scraper";
import { parseInput } from "@/lib/utils/url";
import { selectCompanyName } from "@/lib/utils/company-name";
import { extractColorsFromUrl } from "@/lib/colors/extractor";
import { generateValidatedColorScheme, selectAccentColorWithContext, selectSidebarColors } from "@/lib/colors/generator";
import {
  processSquareIcon,
  extractSquareIconBg,
  extractLogoDominantColor,
  classifyLogoForeground,
  processFullLogo,
  processLoginImage,
  processSocialImage,
  clearImageBufferCache,
} from "@/lib/images/processor";
import { isOpenAIConfigured, generateGradientImagePublic, extractColorsFromScrapedImages, type GradientDebug } from "@/lib/images/dalle";
import { detectDiscipline, selectHeroImage } from "@/lib/discipline";
import { evaluateOgHero, evaluateScrapedHeroes, prepareHeroImage, type ScrapedHeroEvaluation, type HeroImageResult } from "@/lib/images/og-hero-scorer";
import fs from "fs";
import path from "path";
import { generateWelcomeMessage } from "@/lib/welcome-message";

export const maxDuration = 60; // Allow up to 60 seconds

export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
  clearImageBufferCache();
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

    // ── OG hero evaluation ──────────────────────────────────────────
    const ogHeroResult = await evaluateOgHero(scrapedData.ogImage);

    // Extract domain for debug logging
    let domain = "unknown";
    try { domain = new URL(targetUrl).hostname.replace(/^www\./, ""); } catch { /* ignore */ }

    console.log(
      `[og-hero] ${domain} → ${ogHeroResult.passed ? "PASS" : "FAIL"} ` +
        `(${ogHeroResult.score ? `total=${ogHeroResult.score.total}, ${ogHeroResult.score.reasons.join("; ")}` : "no OG image"})`
    );

    // ── Scraped hero fallback ───────────────────────────────────────────
    // Run when OG image failed or is not hero-fit (text-heavy, dark, etc.)
    const ogIsHeroFit =
      ogHeroResult.passed &&
      ogHeroResult.processedImage &&
      ogHeroResult.processedImage.heroFit;

    let scrapedHeroResult: ScrapedHeroEvaluation | null = null;

    if (!ogIsHeroFit) {
      scrapedHeroResult = await evaluateScrapedHeroes(
        scrapedData.images,
        scrapedData.ogImage
      );

      console.log(
        `[scraped-hero] ${domain} → ${scrapedHeroResult.passed ? "PASS" : "FAIL"} ` +
          `(considered: ${scrapedHeroResult.candidatesConsidered}, tried: ${scrapedHeroResult.candidatesTried}` +
          `${scrapedHeroResult.score ? `, total=${scrapedHeroResult.score.total}` : ""}` +
          `${ogHeroResult.passed && !ogIsHeroFit ? ", reason=OG not hero-fit" : ""})`
      );
    }

    // 8. Process images
    let squareIcon: string | null = null;
    let squareIconBg: string | null = null;
    let logoDominantColor: string | null = null;
    let squareIconFg: "dark" | "light" | null = null;
    let fullLogo: string | null = null;
    let socialImage: string | null = null;
    let dalleImageUrl: string | null = null;

    // Login image: hero-fit website image → gradient + logo fallback
    let loginImage: string | null = null;
    let loginImageSource: string;
    let loginImageOrientation: "landscape" | "portrait" | "square" | null = null;
    let loginImageType: "text_heavy" | "photo" | null = null;
    let loginImageEdgeColor: string | null = null;

    // Check hero-fit candidates: OG first, then scraped
    const heroFitImage =
      (ogIsHeroFit && ogHeroResult.processedImage) ? ogHeroResult.processedImage :
      (scrapedHeroResult?.passed && scrapedHeroResult.processedImage?.heroFit) ? scrapedHeroResult.processedImage :
      null;

    if (heroFitImage) {
      loginImage = heroFitImage.dataUrl;
      loginImageOrientation = heroFitImage.orientation;
      loginImageType = heroFitImage.imageType;
      loginImageEdgeColor = heroFitImage.edgeColor;
      loginImageSource = "website";
      console.log(`[hero-select] using hero-fit website image`);
    } else {
      loginImage = null;
      loginImageSource = "gradient";
      console.log(`[hero-select] no hero-fit image → gradient + logo fallback`);
    }

    // Process square icon (from favicon) + extract dominant background
    if (scrapedData.favicon) {
      try {
        squareIcon = await processSquareIcon(scrapedData.favicon);
        if (squareIcon) {
          [squareIconBg, logoDominantColor, squareIconFg] = await Promise.all([
            extractSquareIconBg(squareIcon),
            extractLogoDominantColor(squareIcon),
            classifyLogoForeground(squareIcon),
          ]);
        }
      } catch (error) {
        console.error("Error processing square icon:", error);
      }
    }

    // Process full logo
    if (scrapedData.logo) {
      try {
        fullLogo = (await processFullLogo(scrapedData.logo)) || null;
      } catch (error) {
        console.error("Error processing full logo:", error);
      }
    }

    // Fallback: if no squareIcon from favicon but we have a logo URL,
    // try processing the logo as a squareIcon.  Sites like Wix serve a
    // generic hosting favicon so the favicon pipeline yields nothing,
    // but the logo extractor finds the actual brand mark.
    if (!squareIcon && scrapedData.logo) {
      try {
        squareIcon = await processSquareIcon(scrapedData.logo);
        if (squareIcon) {
          [squareIconBg, logoDominantColor, squareIconFg] = await Promise.all([
            extractSquareIconBg(squareIcon),
            extractLogoDominantColor(squareIcon),
            classifyLogoForeground(squareIcon),
          ]);
        }
      } catch (error) {
        console.error("Error processing logo as square icon fallback:", error);
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

    // domain already extracted above for OG hero debug

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

    // 9. Select company name from candidates
    const companyNameResult = selectCompanyName(scrapedData.companyNameCandidates);
    const companyName = companyNameResult.name;

    // Debug: log all candidates and scores
    console.log(
      `[company-name] ${targetUrl} → "${companyName}" from ${scrapedData.companyNameCandidates.length} candidates`
    );
    for (const c of companyNameResult.candidates.slice(0, 8)) {
      console.log(
        `  [${c.source}${c.parentSource ? ` (${c.parentSource})` : ""}] "${c.value}" → score: ${c.score} (${c.reasons.join(", ")})`
      );
    }

    // ── Welcome message (discipline-tailored when confident) ──
    const welcomeMsg = generateWelcomeMessage({
      companyName,
      discipline: disciplineResult.discipline,
      confidence: disciplineResult.confidence,
      domain,
    });

    // 10. Build response
    const portalData: PortalData = {
      companyName,
      colors,
      images: {
        squareIcon,
        squareIconBg,
        logoDominantColor,
        squareIconFg,
        fullLogo,
        loginImage,
        loginImageOrientation,
        loginImageType,
        loginImageEdgeColor,
        loginGradientImage: dalleImageUrl,
        dashboardImage: dalleImageUrl,
        socialImage,
        rawFaviconUrl: scrapedData.favicon,
        rawLogoUrl: scrapedData.logo,
      },
      welcomeMessage: welcomeMsg.text,
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
      welcomeMessageSource: welcomeMsg.source,
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
      companyNameDebug: {
        selectedName: companyNameResult.name,
        candidates: companyNameResult.candidates.map((c) => ({
          value: c.value,
          source: c.source,
          parentSource: c.parentSource,
          score: c.score,
          reasons: c.reasons,
        })),
      },
      ogHeroEvaluation: {
        ogImageUrl: ogHeroResult.ogImageUrl,
        passed: ogHeroResult.passed,
        score: ogHeroResult.score,
      },
      scrapedHeroEvaluation: scrapedHeroResult
        ? {
            passed: scrapedHeroResult.passed,
            imageUrl: scrapedHeroResult.ogImageUrl,
            candidatesConsidered: scrapedHeroResult.candidatesConsidered,
            candidatesTried: scrapedHeroResult.candidatesTried,
            score: scrapedHeroResult.score,
          }
        : undefined,
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
    // Browser singleton stays alive for subsequent requests (page is
    // already closed by scrapeWebsite).
  }
}
