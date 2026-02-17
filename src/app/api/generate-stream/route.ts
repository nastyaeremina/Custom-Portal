import { NextRequest } from "next/server";
import { GenerateRequestSchema, PortalData, RawOutputs, DalleGeneration } from "@/types/api";
import { scrapeWebsite, closeBrowser } from "@/lib/scraper";
import { parseInput } from "@/lib/utils/url";
import { selectCompanyName } from "@/lib/utils/company-name";
import { extractColorsFromUrl } from "@/lib/colors/extractor";
import { generateValidatedColorScheme, selectAccentColorWithContext, selectSidebarColors } from "@/lib/colors/generator";
import {
  extractSquareIconBg,
  extractLogoDominantColor,
  processFullLogo,
  processLoginImage,
  processSocialImage,
} from "@/lib/images/processor";
import {
  selectBestBrandMark,
  processBrandMark,
} from "@/lib/images/brand-mark-selector";
import { evaluateOgHero, evaluateScrapedHeroes, prepareHeroImage, type ScrapedHeroEvaluation, type HeroImageResult } from "@/lib/images/og-hero-scorer";
import fs from "fs";
import path from "path";
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
import { detectDiscipline, selectHeroImage, pickGenericImage, hashString } from "@/lib/discipline";
import { scorePaletteDiversity } from "@/lib/images/palette-scorer";
import { generateWelcomeMessage } from "@/lib/welcome-message";

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

        // ── Parked-domain detection — wipe brand assets before expensive processing ──
        if (scrapedData.isParkedDomain) {
          console.log(
            `[parked-domain] ${targetUrl} → DETECTED (score: ${scrapedData.parkedDomainSignals?.score}, ` +
            `signals: [${scrapedData.parkedDomainSignals?.signals.join(", ")}])`
          );
          // Null out all brand assets — they belong to the hosting provider
          scrapedData.favicon = null;
          scrapedData.logo = null;
          scrapedData.ogImage = null;
          scrapedData.manifestIcons = [];
          scrapedData.images = [];
          scrapedData.colors = [];
          scrapedData.colorsWithUsage = [];
          scrapedData.linkButtonColors = [];
          scrapedData.navHeaderBackground = null;
          // Keep: title, description, meta, companyNameCandidates (overridden below)
        }

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

        // 7. Select company name from candidates
        const companyNameResult = selectCompanyName(scrapedData.companyNameCandidates);
        // If parked, derive the name from the domain to avoid picking the
        // hosting provider's name (e.g. "Websupport") from the page title.
        let companyName = companyNameResult.name;
        if (scrapedData.isParkedDomain) {
          try {
            const domainStem = new URL(targetUrl).hostname
              .replace(/^www\./, "")
              .split(".")[0];
            companyName =
              domainStem.charAt(0).toUpperCase() + domainStem.slice(1);
            console.log(
              `[parked-domain] overriding company name → "${companyName}" (from domain stem)`
            );
          } catch {
            /* keep selectCompanyName result as fallback */
          }
        }

        // Debug: log all candidates and scores
        console.log(
          `[company-name] ${targetUrl} → "${companyName}" from ${scrapedData.companyNameCandidates.length} candidates`
        );
        for (const c of companyNameResult.candidates.slice(0, 8)) {
          console.log(
            `  [${c.source}${c.parentSource ? ` (${c.parentSource})` : ""}] "${c.value}" → score: ${c.score} (${c.reasons.join(", ")})`
          );
        }

        // ── OG hero evaluation (runs in parallel with discipline + gradient) ──
        const ogHeroPromise = evaluateOgHero(scrapedData.ogImage);

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

        // Extract domain for deterministic hashing
        let domain = "unknown";
        try { domain = new URL(targetUrl).hostname.replace(/^www\./, ""); } catch { /* ignore */ }

        // ── Welcome message (discipline-tailored when confident) ──
        const welcomeMsg = generateWelcomeMessage({
          companyName,
          discipline: disciplineResult.discipline,
          confidence: disciplineResult.confidence,
          domain,
        });
        console.log(
          `[welcome] ${domain} → source: ${welcomeMsg.source}` +
          (welcomeMsg.source === "discipline" ? ` (${disciplineResult.discipline}, confidence: ${disciplineResult.confidence})` : "")
        );

        // ── Gradient color extraction (moved early for diversity scoring) ──
        const gradientColorsForDebug = await extractColorsFromScrapedImages(scrapedImagesInfo);
        const finalGradientColorsForDebug = gradientColorsForDebug.length > 0
          ? gradientColorsForDebug
          : [colors.accent, colors.sidebarBackground];
        const gradientDebugInfo: GradientDebug = computeGradientDebug(finalGradientColorsForDebug, domain);

        console.log(
          `[gradient] ${domain} → mode: ${gradientDebugInfo.mode}, ` +
          `angle: ${gradientDebugInfo.angle}°, stops: [${gradientDebugInfo.stops.join(", ")}] ` +
          `(${gradientDebugInfo.reason})`
        );

        // ── Palette diversity scoring ──────────────────────────────────────
        const diversity = scorePaletteDiversity(
          gradientDebugInfo.stops,
          gradientDebugInfo.mode === "preset"
        );
        const diverse = diversity.useGradient;

        console.log(
          `[diversity] ${domain} → ${diversity.reason} → ${diverse ? "gradient OK" : "use library"}`
        );

        // ── Await OG hero evaluation ──────────────────────────────────
        const ogHeroResult = await ogHeroPromise;

        console.log(
          `[og-hero] ${domain} → ${ogHeroResult.passed ? "PASS" : "FAIL"} ` +
            `(${ogHeroResult.score ? `total=${ogHeroResult.score.total}, ${ogHeroResult.score.reasons.join("; ")}` : "no OG image"})`
        );

        // ── Scraped hero fallback ───────────────────────────────────────
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

        // ── Decision tree: login + dashboard hero images ──────────────────
        // Priority:
        //   1. Hero-fit website image (OG or scraped) → full-bleed cover
        //   2. Gradient + centered logo (primary fallback)
        //   3. Discipline library image (only when confidence ≥ 0.85)
        //   4. Generic library image (final fallback)
        let loginImage: string | null = null;
        let loginImageSource: string;
        let loginImageOrientation: "landscape" | "portrait" | "square" | null = null;
        let loginImageType: "text_heavy" | "photo" | null = null;
        let loginImageEdgeColor: string | null = null;
        let loginGradientImage: string | null = null;
        let dashboardImage: string | null = null;
        let dashboardImageSource: string = "gradient";

        // Helper: set dashboard based on diversity
        const setDashboard = () => {
          if (diverse) {
            dashboardImage = null;
            dashboardImageSource = "gradient";
          } else {
            const generic = pickGenericImage(targetUrl);
            dashboardImage = generic.selected ? generic.imageUrl : null;
            dashboardImageSource = generic.selected ? "generic" : "gradient";
          }
        };

        // Check hero-fit candidates: OG first, then scraped
        const heroFitImage =
          (ogIsHeroFit && ogHeroResult.processedImage) ? ogHeroResult.processedImage :
          (scrapedHeroResult?.passed && scrapedHeroResult.processedImage?.heroFit) ? scrapedHeroResult.processedImage :
          null;

        if (heroFitImage) {
          // ── HERO-FIT WEBSITE IMAGE → full-bleed cover ──
          loginImage = heroFitImage.dataUrl;
          loginImageOrientation = heroFitImage.orientation;
          loginImageType = heroFitImage.imageType;
          loginImageEdgeColor = heroFitImage.edgeColor;
          loginImageSource = "website";
          console.log(`[hero-select] using hero-fit website image`);
          setDashboard();
        } else {
          // ── NO HERO-FIT IMAGE → gradient + centered logo ──
          loginImage = null; // will be filled with gradient after generation
          loginImageSource = "gradient";
          console.log(`[hero-select] no hero-fit image → gradient + logo fallback`);
          setDashboard();
        }

        console.log(
          `[hero-tree] ${domain} → login: ${loginImageSource}${loginImage ? " (data:...)" : " (pending gradient)"} ` +
          `| dashboard: ${dashboardImageSource}${dashboardImage ? ` (${dashboardImage})` : " (pending gradient)"}`
        );

        // Send colors and basic data event
        // Include loginImage + dashboardImage early (prevents flash/fallback swap).
        controller.enqueue(encoder.encode(createSSEMessage({
          type: "colors",
          message: "Colors extracted",
          data: {
            companyName,
            colors,
            images: {
              squareIcon: null,
              squareIconBg: null,
              logoDominantColor: null,
              fullLogo: null,
              loginImage,
              loginImageOrientation,
              loginImageType,
              loginImageEdgeColor,
              loginGradientImage,
              dashboardImage,
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
            diversityScore: diversity,
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
          },
        })));

        // 8. Process images progressively
        let squareIcon: string | null = null;
        let squareIconBg: string | null = null;
        let logoDominantColor: string | null = null;
        let fullLogo: string | null = null;
        let socialImage: string | null = null;
        let dalleImageUrl: string | null = null;
        let dalleGenerations: DalleGeneration[] = initialDalleGenerations;

        // ── Brand mark selection: evaluate favicon + logo + manifest icons ──
        let brandMarkSelection;
        try {
          brandMarkSelection = await selectBestBrandMark(
            scrapedData.favicon,
            scrapedData.logo,
            scrapedData.manifestIcons
          );

          console.log(
            `[brand-mark] ${domain} → ${brandMarkSelection.selected?.source ?? "initials"} ` +
            `(score: ${brandMarkSelection.selected?.analysis?.totalScore ?? "N/A"}) ` +
            `[${brandMarkSelection.log.join("; ")}]`
          );

          if (brandMarkSelection.selected) {
            squareIcon = await processBrandMark(brandMarkSelection.selected);
            if (squareIcon) {
              [squareIconBg, logoDominantColor] = await Promise.all([
                extractSquareIconBg(squareIcon),
                extractLogoDominantColor(squareIcon),
              ]);
              console.log(
                `[avatar-debug] ${domain} → squareIconBg: ${squareIconBg ?? "null"}, ` +
                `logoDominantColor: ${logoDominantColor ?? "null"}, ` +
                `accent: ${colors.accent}`
              );
            }
          }
        } catch (error) {
          console.error("Error in brand mark selection:", error);
          brandMarkSelection = null;
        }

        // Process full logo (still used for future screens / fullLogoUrl)
        if (scrapedData.logo) {
          try {
            fullLogo = await processFullLogo(scrapedData.logo);
          } catch (error) {
            console.error("Error processing full logo:", error);
          }
        }

        // Send images event (brand mark + logo processed)
        controller.enqueue(encoder.encode(createSSEMessage({
          type: "images",
          message: "Brand mark and logo processed",
          data: {
            companyName,
            colors,
            images: {
              squareIcon,
              squareIconBg,
              logoDominantColor,
              fullLogo,
              loginImage,
              loginImageOrientation,
              loginImageType,
              loginImageEdgeColor,
              loginGradientImage,
              dashboardImage,
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
                logoDominantColor,
                fullLogo,
                loginImage,
                loginImageOrientation,
                loginImageType,
                loginImageEdgeColor,
                loginGradientImage,
                dashboardImage,
                socialImage: scrapedSocialImage,
                rawFaviconUrl: scrapedData.favicon,
                rawLogoUrl: scrapedData.logo,
              },
            },
          })));
        }

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

            // Find the gradient generation for hero images
            const gradientGeneration = dalleGenerations.find(
              g => g.approach === "gradient" && g.status === "complete" && g.imageUrl
            );

            if (gradientGeneration?.imageUrl) {
              dalleImageUrl = gradientGeneration.imageUrl;
              // Fill in any "gradient" slots that were deferred
              if (loginImageSource === "gradient") {
                loginGradientImage = gradientGeneration.imageUrl;
              }
              if (dashboardImageSource === "gradient" && !dashboardImage) {
                dashboardImage = gradientGeneration.imageUrl;
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
            logoDominantColor,
            fullLogo,
            loginImage,
            loginImageOrientation,
            loginImageType,
            loginImageEdgeColor,
            loginGradientImage,
            dashboardImage,
            socialImage,
            rawFaviconUrl: scrapedData.favicon,
            rawLogoUrl: scrapedData.logo,
          },
          welcomeMessage: welcomeMsg.text,
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
            dashboardImageSource,
          },
          gradientDebug: gradientDebugInfo,
          diversityScore: diversity,
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
          brandMarkSelection: brandMarkSelection
            ? {
                candidates: brandMarkSelection.candidates.map((c) => ({
                  url: c.url.startsWith("data:") ? `data:...${c.url.slice(-20)}` : c.url,
                  source: c.source,
                  totalScore: c.analysis?.totalScore ?? 0,
                  scores: c.analysis?.scores ?? { aspect: 0, resolution: 0, complexity: 0, source: 0, monogram: 0 },
                  disqualified: c.analysis?.disqualified ?? true,
                  disqualifyReason: c.analysis?.disqualifyReason,
                })),
                selectedSource: brandMarkSelection.selected?.source ?? null,
                fallbackToInitials: brandMarkSelection.fallbackToInitials,
                log: brandMarkSelection.log,
              }
            : undefined,
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
          parkedDomainDetection: scrapedData.parkedDomainSignals
            ? {
                isParked: scrapedData.isParkedDomain,
                score: scrapedData.parkedDomainSignals.score,
                threshold: scrapedData.parkedDomainSignals.threshold,
                signals: scrapedData.parkedDomainSignals.signals,
              }
            : undefined,
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
