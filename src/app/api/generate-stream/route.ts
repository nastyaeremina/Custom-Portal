import { NextRequest } from "next/server";
import { GenerateRequestSchema, PortalData, RawOutputs, DalleGeneration } from "@/types/api";
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
import {
  isOpenAIConfigured,
  generateAllDalleImages,
  getLogoCenteredPrompt,
  getAccentWavePrompt,
  getGradientPrompt,
  getOgExtendedPrompt,
  LogoCenteredInput,
  generateGradientImagePublic,
  extractColorsFromScrapedImages,
  computeGradientDebug,
  type GradientDebug,
} from "@/lib/images/dalle";
import { detectDiscipline, selectHeroImage } from "@/lib/discipline";

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

        // 4. Select accent color WITH context (extracts both favicon and logo saturation)
        const accentSelection = await selectAccentColorWithContext({
          squareIconUrl: scrapedData.favicon,
          logoUrl: scrapedData.logo,
          linkButtonColors: scrapedData.linkButtonColors,
        });

        const accentResult = accentSelection.result;

        // 5. Build extracted colors list for quality gate context
        const allExtractedColors = [
          ...scrapedData.colors,
          ...(scrapedData.linkButtonColors || []),
        ];

        // 6. Generate VALIDATED color scheme with quality gate
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

        // 7. Clean company name
        const companyName = cleanCompanyName(
          scrapedData.meta["og:site_name"] ||
          scrapedData.meta["og:title"] ||
          scrapedData.title
        );

        // ── Discipline detection ──────────────────────────────────────
        const disciplineResult = detectDiscipline({
          url: targetUrl,
          title: scrapedData.title,
          description: scrapedData.description,
          meta: scrapedData.meta,
        });

        const heroSelection = selectHeroImage(disciplineResult, targetUrl);

        // Console debug snapshot
        console.log(
          `[discipline] ${targetUrl} → ${disciplineResult.discipline} ` +
          `(confidence: ${disciplineResult.confidence}, signals: [${disciplineResult.signals.join(", ")}]) ` +
          `→ hero: ${heroSelection.selected ? heroSelection.imageUrl : "SKIP → gradient fallback"} ` +
          `(${heroSelection.reason})`
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
        const initialDalleGenerations: DalleGeneration[] = [
          {
            approach: "logo_centered",
            prompt: getLogoCenteredPrompt(colors.sidebarBackground),
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
            prompt: getGradientPrompt([colors.accent, colors.sidebarBackground]),
            imageUrl: null,
            status: "pending",
          },
        ];

        // Add 4th approach if OG image is available
        if (scrapedData.ogImage) {
          initialDalleGenerations.push({
            approach: "og_extended",
            prompt: getOgExtendedPrompt(),
            imageUrl: null,
            status: "pending",
          });
        }

        // Login image: discipline library takes priority, gradient is fallback.
        // Computed early so all SSE events can include it (prevents flash).
        let loginImage: string | null = heroSelection.selected ? heroSelection.imageUrl : null;
        let loginImageSource: string = heroSelection.selected ? "library" : "gradient";

        // Send colors and basic data event
        // Include loginImage early — discipline hero selection is already done,
        // so the client can render the login card without a flash/fallback swap.
        controller.enqueue(encoder.encode(createSSEMessage({
          type: "colors",
          message: "Colors extracted",
          data: {
            companyName,
            colors,
            images: {
              squareIcon: null,
              squareIconBg: null,
              fullLogo: null,
              loginImage,
              dashboardImage: null,
              socialImage: null,
              rawFaviconUrl: scrapedData.favicon,
              rawLogoUrl: scrapedData.logo,
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
            qualityGateResult: {
              passed: validatedColors.qualityGate.passed,
              checks: validatedColors.qualityGate.checks,
              adjustments: validatedColors.qualityGate.adjustments,
              iterations: validatedColors.qualityGate.iterations,
              originalColors: validatedColors.qualityGate.originalColors,
            },
            accentPromotion: validatedColors.accentPromotion,
          },
        })));

        // 8. Process images progressively
        let squareIcon: string | null = null;
        let squareIconBg: string | null = null;
        let fullLogo: string | null = null;
        let socialImage: string | null = null;
        let dalleImageUrl: string | null = null;
        let dalleGenerations: DalleGeneration[] = initialDalleGenerations;

        // Process square icon + extract its dominant background
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

        // Send images event (favicon/logo processed)
        controller.enqueue(encoder.encode(createSSEMessage({
          type: "images",
          message: "Favicon and logo processed",
          data: {
            companyName,
            colors,
            images: {
              squareIcon,
              squareIconBg,
              fullLogo,
              loginImage,
              dashboardImage: null,
              socialImage: null,
              rawFaviconUrl: scrapedData.favicon,
              rawLogoUrl: scrapedData.logo,
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
                squareIconBg,
                fullLogo,
                loginImage,
                dashboardImage: null,
                socialImage: scrapedSocialImage,
                rawFaviconUrl: scrapedData.favicon,
                rawLogoUrl: scrapedData.logo,
              },
            },
          })));
        }

        // Extract domain for deterministic gradient hashing
        let domain = "unknown";
        try { domain = new URL(targetUrl).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
        let gradientDebugInfo: GradientDebug | undefined;

        // Generate all image approaches (deterministic, no AI)
        if (isOpenAIConfigured()) {
          const approachCount = scrapedData.ogImage ? 4 : 3;
          controller.enqueue(encoder.encode(createSSEMessage({
            type: "dalle",
            message: `Generating images (${approachCount} approaches)...`,
            rawOutputs: {
              dalleGenerations: dalleGenerations.map(g => ({ ...g, status: "generating" as const })),
            },
          })));

          try {
            dalleGenerations = await generateAllDalleImages(
              colors,
              companyName,
              scrapedImagesInfo,
              logoCenteredInput,
              scrapedData.ogImage
            );

            // Find the gradient generation (approach 3) for login image
            const gradientGeneration = dalleGenerations.find(
              g => g.approach === "gradient" && g.status === "complete" && g.imageUrl
            );

            if (gradientGeneration?.imageUrl) {
              dalleImageUrl = gradientGeneration.imageUrl;
              // Use gradient for login only if discipline library didn't provide one
              if (!loginImage) {
                loginImage = gradientGeneration.imageUrl;
                loginImageSource = "gradient";
              }
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

            // Compute gradient debug info (lightweight, synchronous)
            // Use the same color inputs that generateAllDalleImages used internally
            const gradientColorsForDebug = await extractColorsFromScrapedImages(scrapedImagesInfo);
            const finalGradientColorsForDebug = gradientColorsForDebug.length > 0
              ? gradientColorsForDebug
              : [colors.accent, colors.sidebarBackground];
            gradientDebugInfo = computeGradientDebug(finalGradientColorsForDebug, domain);

            console.log(
              `[gradient] ${domain} → mode: ${gradientDebugInfo.mode}, ` +
              `angle: ${gradientDebugInfo.angle}°, stops: [${gradientDebugInfo.stops.join(", ")}] ` +
              `(${gradientDebugInfo.reason})`
            );

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
            squareIconBg,
            fullLogo,
            loginImage,
            dashboardImage: dalleImageUrl,
            socialImage,
            rawFaviconUrl: scrapedData.favicon,
            rawLogoUrl: scrapedData.logo,
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
