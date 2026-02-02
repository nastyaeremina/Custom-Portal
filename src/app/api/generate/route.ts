import { NextRequest, NextResponse } from "next/server";
import { GenerateRequestSchema, GenerateResponse, PortalData, RawOutputs } from "@/types/api";
import { scrapeWebsite, closeBrowser } from "@/lib/scraper";
import { parseInput } from "@/lib/utils/url";
import { cleanCompanyName } from "@/lib/utils/company-name";
import { extractColorsFromUrl } from "@/lib/colors/extractor";
import { generateColorScheme, selectAccentColor, selectSidebarColors } from "@/lib/colors/generator";
import {
  processSquareIcon,
  processFullLogo,
  processLoginImage,
  processSocialImage,
} from "@/lib/images/processor";
import { isOpenAIConfigured, generateGradientImagePublic, extractColorsFromScrapedImages } from "@/lib/images/dalle";

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

    // 5. Select accent color using priority logic:
    //    favicon -> logo -> link/button colors -> null
    const accentResult = await selectAccentColor({
      squareIconUrl: scrapedData.favicon,
      logoUrl: scrapedData.logo,
      linkButtonColors: scrapedData.linkButtonColors,
    });

    // 6. Generate color scheme using nav/header background and accent
    const colors = generateColorScheme(
      scrapedData.navHeaderBackground,
      accentResult.color
    );

    // Get sidebar source for debug info
    const sidebarResult = selectSidebarColors({
      navHeaderBackground: scrapedData.navHeaderBackground,
      accentColor: accentResult.color,
    });

    // 7. Process images
    let squareIcon: string | null = null;
    let fullLogo: string | null = null;
    let loginImage: string | null = null;
    let socialImage: string | null = null;
    let dalleImageUrl: string | null = null;

    // Process square icon (from favicon)
    if (scrapedData.favicon) {
      try {
        squareIcon = await processSquareIcon(scrapedData.favicon);
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

    if (isOpenAIConfigured()) {
      try {
        console.log("Generating gradient image...");
        // Extract colors from scraped images for gradient
        const gradientColors = await extractColorsFromScrapedImages(scrapedImagesInfo);
        const finalColors = gradientColors.length > 0
          ? gradientColors
          : [colors.accent, colors.sidebarBackground];
        dalleImageUrl = await generateGradientImagePublic(finalColors);
        // Always use gradient for login image
        loginImage = dalleImageUrl;
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

    // 8. Clean company name
    const companyName = cleanCompanyName(
      scrapedData.meta["og:site_name"] ||
      scrapedData.meta["og:title"] ||
      scrapedData.title
    );

    // 9. Build response
    const portalData: PortalData = {
      companyName,
      colors,
      images: {
        squareIcon,
        fullLogo,
        loginImage,
        socialImage,
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
