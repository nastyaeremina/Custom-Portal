import { NextRequest } from "next/server";
import { GenerateRequestSchema, PortalData, RawOutputs, DalleGeneration } from "@/types/api";
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
import {
  isOpenAIConfigured,
  generateAllDalleImages,
  getLogoCenteredPrompt,
  getAccentWavePrompt,
  getGradientPrompt,
  LogoCenteredInput,
  generateGradientImagePublic,
  extractColorsFromScrapedImages,
} from "@/lib/images/dalle";

export const maxDuration = 120; // Allow up to 120 seconds for multiple DALL-E generations

interface StreamEvent {
  type: "scraping" | "colors" | "images" | "dalle" | "dalle_progress" | "complete" | "error";
  data?: Partial<PortalData>;
  rawOutputs?: Partial<RawOutputs>;
  message?: string;
  error?: string;
}

function createSSEMessage(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1. Parse and validate input
        const body = await request.json();
        const { input } = GenerateRequestSchema.parse(body);
        const targetUrl = parseInput(input);

        // Send scraping started event
        controller.enqueue(encoder.encode(createSSEMessage({
          type: "scraping",
          message: `Scraping ${targetUrl}...`,
        })));

        // 2. Scrape website
        const scrapedData = await scrapeWebsite(targetUrl);

        // 3. Extract colors from favicon/logo for palette (used for debug display)
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

        // 4. Select accent color using priority logic:
        //    favicon -> logo -> link/button colors -> null
        const accentResult = await selectAccentColor({
          squareIconUrl: scrapedData.favicon,
          logoUrl: scrapedData.logo,
          linkButtonColors: scrapedData.linkButtonColors,
        });

        // 5. Generate color scheme using nav/header background and accent
        const colors = generateColorScheme(
          scrapedData.navHeaderBackground,
          accentResult.color
        );

        // Get sidebar source for debug info
        const sidebarResult = selectSidebarColors({
          navHeaderBackground: scrapedData.navHeaderBackground,
          accentColor: accentResult.color,
        });

        // 6. Clean company name
        const companyName = cleanCompanyName(
          scrapedData.meta["og:site_name"] ||
          scrapedData.meta["og:title"] ||
          scrapedData.title
        );

        // Prepare scraped images info for DALL-E prompts
        const scrapedImagesInfo = scrapedData.images.map(img => ({
          url: img.url,
          width: img.width,
          height: img.height,
          type: img.type,
        }));

        // Prepare logo centered input (prefer icon over logo)
        const logoCenteredInput: LogoCenteredInput = {
          iconUrl: scrapedData.favicon,
          logoUrl: scrapedData.logo,
          backgroundColor: null, // Will be extracted from icon/logo
        };

        // Initialize DALL-E generations with prompts but no images yet
        // Note: For logo_centered and gradient, we use placeholder prompts since
        // the actual prompts depend on extracted colors which happen during generation
        const initialDalleGenerations: DalleGeneration[] = [
          {
            approach: "logo_centered",
            prompt: getLogoCenteredPrompt(colors.sidebarBackground), // Placeholder, will be updated
            imageUrl: null,
            status: "pending",
          },
          {
            approach: "accent_wave",
            prompt: getAccentWavePrompt(colors.accent),
            imageUrl: null,
            status: "pending",
          },
          {
            approach: "gradient",
            prompt: getGradientPrompt([colors.accent, colors.sidebarBackground]), // Placeholder
            imageUrl: null,
            status: "pending",
          },
        ];

        // Send colors and basic data event
        controller.enqueue(encoder.encode(createSSEMessage({
          type: "colors",
          message: "Colors extracted",
          data: {
            companyName,
            colors,
            images: {
              squareIcon: null,
              fullLogo: null,
              loginImage: null,
              socialImage: null,
            },
          },
          rawOutputs: {
            scrapedColors: scrapedData.colorsWithUsage,
            scrapedImages: scrapedImagesInfo,
            extractedMeta: scrapedData.meta,
            colorThiefPalette: imageColors,
            generatedWithDalle: false,
            faviconUrl: scrapedData.favicon,
            logoUrl: scrapedData.logo,
            dalleImageUrl: null,
            dalleGenerations: initialDalleGenerations,
            accentColorSource: accentResult.source,
            accentColorConfidence: accentResult.isHighConfidence ? "high" : "low",
            navHeaderBackground: scrapedData.navHeaderBackground,
            sidebarColorSource: sidebarResult.source,
          },
        })));

        // 7. Process images progressively
        let squareIcon: string | null = null;
        let fullLogo: string | null = null;
        let loginImage: string | null = null;
        let socialImage: string | null = null;
        let dalleImageUrl: string | null = null;
        let dalleGenerations: DalleGeneration[] = initialDalleGenerations;

        // Process square icon
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

        // Send images event (favicon/logo processed)
        controller.enqueue(encoder.encode(createSSEMessage({
          type: "images",
          message: "Favicon and logo processed",
          data: {
            companyName,
            colors,
            images: {
              squareIcon,
              fullLogo,
              loginImage: null,
              socialImage: null,
            },
          },
        })));

        // Process social image from OG (scraped source)
        let scrapedSocialImage: string | null = null;
        if (scrapedData.ogImage) {
          try {
            scrapedSocialImage = await processSocialImage(scrapedData.ogImage);
          } catch (error) {
            console.error("Error processing social image:", error);
          }
        }

        // Send update with scraped images
        if (scrapedSocialImage) {
          controller.enqueue(encoder.encode(createSSEMessage({
            type: "images",
            message: "Scraped images processed",
            data: {
              companyName,
              colors,
              images: {
                squareIcon,
                fullLogo,
                loginImage: null,
                socialImage: scrapedSocialImage,
              },
            },
          })));
        }

        // Generate all image approaches (deterministic, no AI)
        if (isOpenAIConfigured()) {
          controller.enqueue(encoder.encode(createSSEMessage({
            type: "dalle",
            message: "Generating images (3 approaches)...",
            rawOutputs: {
              dalleGenerations: dalleGenerations.map(g => ({ ...g, status: "generating" as const })),
            },
          })));

          try {
            dalleGenerations = await generateAllDalleImages(
              colors,
              companyName,
              scrapedImagesInfo,
              logoCenteredInput
            );

            // Find the gradient generation (approach 3) for login image
            const gradientGeneration = dalleGenerations.find(
              g => g.approach === "gradient" && g.status === "complete" && g.imageUrl
            );

            if (gradientGeneration?.imageUrl) {
              dalleImageUrl = gradientGeneration.imageUrl;
              // Always use gradient (approach 3) for login image
              loginImage = gradientGeneration.imageUrl;
            }

            // For social image: use scraped OG image if available, otherwise use gradient
            if (scrapedSocialImage) {
              socialImage = scrapedSocialImage;
            } else if (gradientGeneration?.imageUrl) {
              try {
                socialImage = await processSocialImage(gradientGeneration.imageUrl);
              } catch (error) {
                console.error("Error processing gradient image for social:", error);
              }
            }

            // Send update with generations
            controller.enqueue(encoder.encode(createSSEMessage({
              type: "dalle_progress",
              message: "Images generated",
              rawOutputs: {
                dalleGenerations,
                generatedWithDalle: dalleImageUrl !== null,
                dalleImageUrl,
              },
            })));
          } catch (error) {
            console.error("Error generating images:", error);
            dalleGenerations = dalleGenerations.map(g => ({
              ...g,
              status: "error" as const,
              error: error instanceof Error ? error.message : "Generation failed",
            }));
          }
        }

        // Send complete event
        const finalData: PortalData = {
          companyName,
          colors,
          images: {
            squareIcon,
            fullLogo,
            loginImage,
            socialImage,
          },
        };

        const finalRawOutputs: RawOutputs = {
          scrapedColors: scrapedData.colorsWithUsage,
          scrapedImages: scrapedImagesInfo,
          extractedMeta: scrapedData.meta,
          colorThiefPalette: imageColors,
          generatedWithDalle: dalleImageUrl !== null,
          faviconUrl: scrapedData.favicon,
          logoUrl: scrapedData.logo,
          dalleImageUrl,
          dalleGenerations,
          accentColorSource: accentResult.source,
          accentColorConfidence: accentResult.isHighConfidence ? "high" : "low",
          navHeaderBackground: scrapedData.navHeaderBackground,
          sidebarColorSource: sidebarResult.source,
        };

        controller.enqueue(encoder.encode(createSSEMessage({
          type: "complete",
          message: "Complete",
          data: finalData,
          rawOutputs: finalRawOutputs,
        })));

      } catch (error) {
        console.error("Error in generate stream API:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        controller.enqueue(encoder.encode(createSSEMessage({
          type: "error",
          error: errorMessage,
        })));
      } finally {
        try {
          await closeBrowser();
        } catch {
          // Ignore cleanup errors
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
