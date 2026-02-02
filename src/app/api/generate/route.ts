import { NextRequest, NextResponse } from "next/server";
import { GenerateRequestSchema, GenerateResponse, PortalData, RawOutputs } from "@/types/api";
import { scrapeWebsite, closeBrowser } from "@/lib/scraper";
import { parseInput } from "@/lib/utils/url";
import { cleanCompanyName } from "@/lib/utils/company-name";
import { extractColorsFromUrl } from "@/lib/colors/extractor";
import { generateColorScheme } from "@/lib/colors/generator";
import {
  processSquareIcon,
  processFullLogo,
  processLoginImage,
  processSocialImage,
} from "@/lib/images/processor";
import { generateLoginImage, isOpenAIConfigured } from "@/lib/images/dalle";

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

    // 4. Extract colors from favicon/logo if available
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

    // 5. Generate color scheme
    const colors = generateColorScheme(scrapedData.colors, imageColors);

    // 6. Process images
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

    // Always generate a DALL-E image for AI Generations section
    const companyNameForDalle = cleanCompanyName(scrapedData.title);
    if (isOpenAIConfigured()) {
      try {
        console.log("Generating DALL-E image...");
        dalleImageUrl = await generateLoginImage(colors, companyNameForDalle);
      } catch (error) {
        console.error("Error generating image with DALL-E:", error);
      }
    }

    // Process login image
    // First try OG image, then hero images, then use DALL-E generated image
    const loginImageSource = scrapedData.ogImage ||
      scrapedData.images.find(img => img.type === "hero")?.url;

    if (loginImageSource) {
      try {
        loginImage = await processLoginImage(loginImageSource);
      } catch (error) {
        console.error("Error processing login image:", error);
      }
    }

    // If no suitable scraped image found, use DALL-E generated image
    if (!loginImage && dalleImageUrl) {
      loginImage = dalleImageUrl;
    }

    // Process social image (from OG image or DALL-E)
    if (scrapedData.ogImage) {
      try {
        socialImage = await processSocialImage(scrapedData.ogImage);
      } catch (error) {
        console.error("Error processing social image:", error);
      }
    } else if (dalleImageUrl) {
      // Use DALL-E image as social image if no OG image available
      try {
        socialImage = await processSocialImage(dalleImageUrl);
      } catch (error) {
        console.error("Error processing DALL-E image for social:", error);
      }
    }

    // 7. Clean company name
    const companyName = cleanCompanyName(
      scrapedData.meta["og:site_name"] ||
      scrapedData.meta["og:title"] ||
      scrapedData.title
    );

    // 8. Build response
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
      scrapedColors: scrapedData.colors,
      scrapedImages: scrapedData.images.map(img => ({
        url: img.url,
        width: img.width,
        height: img.height,
      })),
      extractedMeta: scrapedData.meta,
      colorThiefPalette: imageColors,
      generatedWithDalle: dalleImageUrl !== null,
      faviconUrl: scrapedData.favicon,
      logoUrl: scrapedData.logo,
      dalleImageUrl,
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
