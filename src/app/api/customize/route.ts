import { NextRequest, NextResponse } from "next/server";
import { GenerateRequestSchema, PortalData, PortalColors, PortalImages } from "@/types/api";
import { scrapeWebsite } from "@/lib/scraper";
import { parseInput } from "@/lib/utils/url";
import { selectCompanyName } from "@/lib/utils/company-name";
import { extractColorsFromUrl } from "@/lib/colors/extractor";
import { generateValidatedColorScheme, selectAccentColorWithContext } from "@/lib/colors/generator";
import {
  extractSquareIconBg,
  extractLogoDominantColor,
  classifyLogoForeground,
  processFullLogo,
  processSocialImage,
  clearImageBufferCache,
} from "@/lib/images/processor";
import {
  selectBestBrandMark,
  processBrandMark,
} from "@/lib/images/brand-mark-selector";
import { evaluateOgHero, evaluateScrapedHeroes, type ScrapedHeroEvaluation } from "@/lib/images/og-hero-scorer";
import {
  isOpenAIConfigured,
  generateAllDalleImages,
  LogoCenteredInput,
  extractColorsFromScrapedImages,
  computeGradientDebug,
} from "@/lib/images/dalle";
import { detectDiscipline, selectHeroImage, pickGenericImage } from "@/lib/discipline";
import { scorePaletteDiversity } from "@/lib/images/palette-scorer";
import { generateWelcomeMessage } from "@/lib/welcome-message";
import { uploadPortalImages } from "@/lib/storage/blob-upload";

export const maxDuration = 60;

/* ─── Auth ─────────────────────────────────────────────────────────── */

function checkAuth(request: NextRequest): boolean {
  const key = process.env.CUSTOMIZE_API_KEY;
  if (!key) return true; // no key configured = open (dev mode)
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${key}`;
}

/* ─── CORS ─────────────────────────────────────────────────────────── */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*", // tighten to assembly.com domains later
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/* ─── Default color fallback ───────────────────────────────────────── */

const DEFAULT_COLORS: PortalColors = {
  sidebarBackground: "#1B1B1B",
  sidebarText: "#FFFFFF",
  accent: "#3B82F6",
};

const NULL_IMAGES: PortalImages = {
  squareIcon: null,
  squareIconBg: null,
  logoDominantColor: null,
  squareIconFg: null,
  fullLogo: null,
  loginImage: null,
  loginImageOrientation: null,
  loginImageType: null,
  loginImageEdgeColor: null,
  loginGradientImage: null,
  dashboardImage: null,
  socialImage: null,
  rawFaviconUrl: null,
  rawLogoUrl: null,
};

/* ─── Response helpers ─────────────────────────────────────────────── */

interface CustomizeResponse {
  success: boolean;
  data?: PortalData;
  partial?: Partial<PortalData> | null;
  error?: string;
}

function ok(data: PortalData): NextResponse<CustomizeResponse> {
  return NextResponse.json({ success: true, data }, { headers: corsHeaders });
}

function fail(
  error: string,
  partial: Partial<PortalData> | null,
  status: number
): NextResponse<CustomizeResponse> {
  return NextResponse.json(
    { success: false, error, partial },
    { status, headers: corsHeaders }
  );
}

/* ─── POST handler ─────────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  if (!checkAuth(request)) {
    return fail("Unauthorized", null, 401);
  }

  clearImageBufferCache();

  // Progressive partial data — updated as each stage completes
  let companyName = "";
  let colors: PortalColors = DEFAULT_COLORS;
  let images: PortalImages = { ...NULL_IMAGES };
  let welcomeMessage = "";

  const buildPartial = (): Partial<PortalData> => ({
    ...(companyName ? { companyName } : {}),
    colors,
    images,
    ...(welcomeMessage ? { welcomeMessage } : {}),
  });

  try {
    // ── 1. Parse & validate input ───────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return fail("Invalid JSON body", null, 400);
    }

    const parsed = GenerateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail("Missing or invalid 'input' field", null, 400);
    }
    const { input } = parsed.data;

    let targetUrl: string;
    try {
      targetUrl = parseInput(input);
    } catch (e) {
      return fail(
        `Could not parse input: ${e instanceof Error ? e.message : String(e)}`,
        null,
        400
      );
    }

    // ── 2. Scrape website ───────────────────────────────────────────
    const scrapedData = await scrapeWebsite(targetUrl);

    // ── 3. Parked-domain detection ──────────────────────────────────
    if (scrapedData.isParkedDomain) {
      scrapedData.favicon = null;
      scrapedData.logo = null;
      scrapedData.ogImage = null;
      scrapedData.manifestIcons = [];
      scrapedData.images = [];
      scrapedData.colors = [];
      scrapedData.colorsWithUsage = [];
      scrapedData.linkButtonColors = [];
      scrapedData.navHeaderBackground = null;
    }

    // Store raw URLs for passthrough
    images.rawFaviconUrl = scrapedData.favicon;
    images.rawLogoUrl = scrapedData.logo;

    // ── 4. Color extraction + accent ────────────────────────────────
    try {
      const colorSource = scrapedData.favicon || scrapedData.logo;
      const [, accentSelection] = await Promise.all([
        colorSource
          ? extractColorsFromUrl(colorSource)
              .then((p) => p.palette)
              .catch(() => [] as string[])
          : Promise.resolve([] as string[]),
        selectAccentColorWithContext({
          squareIconUrl: scrapedData.favicon,
          logoUrl: scrapedData.logo,
          linkButtonColors: scrapedData.linkButtonColors,
        }),
      ]);

      const accentResult = accentSelection.result;
      const allExtractedColors = [
        ...scrapedData.colors,
        ...(scrapedData.linkButtonColors || []),
      ];

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

      colors = {
        sidebarBackground: validatedColors.sidebarBackground,
        sidebarText: validatedColors.sidebarText,
        accent: validatedColors.accent,
      };
    } catch (e) {
      console.error("[customize] color extraction failed, using defaults:", e);
      // colors stays DEFAULT_COLORS
    }

    // ── 5. Company name ─────────────────────────────────────────────
    try {
      const companyNameResult = selectCompanyName(scrapedData.companyNameCandidates);
      companyName = companyNameResult.name;

      if (scrapedData.isParkedDomain) {
        const domainStem = new URL(targetUrl).hostname
          .replace(/^www\./, "")
          .split(".")[0];
        companyName = domainStem.charAt(0).toUpperCase() + domainStem.slice(1);
      }
    } catch {
      // Fallback: derive from domain
      try {
        const domainStem = new URL(targetUrl).hostname
          .replace(/^www\./, "")
          .split(".")[0];
        companyName = domainStem.charAt(0).toUpperCase() + domainStem.slice(1);
      } catch {
        companyName = "Workspace";
      }
    }

    // ── 6. Launch parallel I/O-heavy promises ───────────────────────
    const ogHeroPromise = evaluateOgHero(scrapedData.ogImage);

    const fullLogoPromise = scrapedData.logo
      ? processFullLogo(scrapedData.logo).catch(() => null)
      : Promise.resolve(null);

    const socialImagePromise = scrapedData.ogImage
      ? processSocialImage(scrapedData.ogImage).catch(() => null)
      : Promise.resolve(null);

    const brandMarkPromise = selectBestBrandMark(
      scrapedData.favicon,
      scrapedData.logo,
      scrapedData.manifestIcons
    ).catch(() => null);

    // ── 7. Discipline detection ─────────────────────────────────────
    const disciplineResult = detectDiscipline({
      url: targetUrl,
      title: scrapedData.title,
      description: scrapedData.description,
      meta: scrapedData.meta,
    });

    let domain = "unknown";
    try {
      domain = new URL(targetUrl).hostname.replace(/^www\./, "");
    } catch {
      /* ignore */
    }

    // ── 8. Welcome message ──────────────────────────────────────────
    try {
      const welcomeMsg = generateWelcomeMessage({
        companyName,
        discipline: disciplineResult.discipline,
        confidence: disciplineResult.confidence,
        domain,
      });
      welcomeMessage = welcomeMsg.text;
    } catch {
      welcomeMessage = `Welcome to ${companyName}! We're excited to have you here.`;
    }

    // ── 9. Gradient + diversity scoring ─────────────────────────────
    const scrapedImagesInfo = scrapedData.images.map((img) => ({
      url: img.url,
      width: img.width,
      height: img.height,
      type: img.type,
    }));

    let gradientStops: string[] = [colors.accent, colors.sidebarBackground];
    let diverse = false;
    try {
      const gradientColors = await extractColorsFromScrapedImages(scrapedImagesInfo);
      const finalColors =
        gradientColors.length > 0
          ? gradientColors
          : [colors.accent, colors.sidebarBackground];
      const gradientDebug = computeGradientDebug(finalColors, domain);
      gradientStops = gradientDebug.stops;

      const diversity = scorePaletteDiversity(
        gradientDebug.stops,
        gradientDebug.mode === "preset"
      );
      diverse = diversity.useGradient;
    } catch (e) {
      console.error("[customize] gradient/diversity scoring failed:", e);
    }

    // ── 10. OG hero evaluation ──────────────────────────────────────
    let loginImage: string | null = null;
    let loginImageOrientation: "landscape" | "portrait" | "square" | null = null;
    let loginImageType: "text_heavy" | "photo" | null = null;
    let loginImageEdgeColor: string | null = null;
    let loginGradientImage: string | null = null;
    let dashboardImage: string | null = null;

    try {
      const ogHeroResult = await ogHeroPromise;
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
      }

      const heroFitImage =
        ogIsHeroFit && ogHeroResult.processedImage
          ? ogHeroResult.processedImage
          : scrapedHeroResult?.passed && scrapedHeroResult.processedImage?.heroFit
            ? scrapedHeroResult.processedImage
            : null;

      if (heroFitImage) {
        loginImage = heroFitImage.dataUrl;
        loginImageOrientation = heroFitImage.orientation;
        loginImageType = heroFitImage.imageType;
        loginImageEdgeColor = heroFitImage.edgeColor;
      }
    } catch (e) {
      console.error("[customize] hero evaluation failed:", e);
    }

    // Dashboard: gradient if diverse, otherwise generic library image
    if (diverse) {
      dashboardImage = null; // consumer generates gradient client-side from colors
    } else {
      try {
        const generic = pickGenericImage(targetUrl);
        dashboardImage = generic.selected ? generic.imageUrl : null;
      } catch {
        dashboardImage = null;
      }
    }

    // ── 11. Brand mark + logo ───────────────────────────────────────
    let squareIcon: string | null = null;
    let squareIconBg: string | null = null;
    let logoDominantColor: string | null = null;
    let squareIconFg: "dark" | "light" | null = null;
    let fullLogo: string | null = null;

    try {
      const brandMarkSelection = await brandMarkPromise;
      if (brandMarkSelection?.selected) {
        squareIcon = await processBrandMark(brandMarkSelection.selected);
        if (squareIcon) {
          [squareIconBg, logoDominantColor, squareIconFg] = await Promise.all([
            extractSquareIconBg(squareIcon),
            extractLogoDominantColor(squareIcon),
            classifyLogoForeground(squareIcon),
          ]);
        }
      }
    } catch (e) {
      console.error("[customize] brand mark processing failed:", e);
    }

    try {
      fullLogo = (await fullLogoPromise) || null;
    } catch {
      fullLogo = null;
    }

    // ── 12. DALL-E gradient generation ──────────────────────────────
    if (isOpenAIConfigured()) {
      try {
        const logoCenteredInput: LogoCenteredInput = {
          iconUrl: scrapedData.favicon,
          logoUrl: scrapedData.logo,
          backgroundColor: null,
        };

        const dalleGenerations = await generateAllDalleImages(
          colors,
          companyName,
          scrapedImagesInfo,
          logoCenteredInput,
          scrapedData.ogImage,
          await extractColorsFromScrapedImages(scrapedImagesInfo).catch(() => [])
        );

        const gradientGen = dalleGenerations.find(
          (g) => g.approach === "gradient" && g.status === "complete" && g.imageUrl
        );

        if (gradientGen?.imageUrl) {
          if (!loginImage) {
            loginGradientImage = gradientGen.imageUrl;
          }
          if (!dashboardImage) {
            dashboardImage = gradientGen.imageUrl;
          }
        }
      } catch (e) {
        console.error("[customize] DALL-E generation failed:", e);
      }
    }

    // ── 13. Social image ────────────────────────────────────────────
    let socialImage: string | null = null;
    try {
      const scrapedSocial = await socialImagePromise;
      if (scrapedSocial) {
        socialImage = scrapedSocial;
      } else if (loginGradientImage) {
        socialImage = await processSocialImage(loginGradientImage).catch(() => null);
      }
    } catch {
      socialImage = null;
    }

    // ── Assemble final response ─────────────────────────────────────
    images = {
      squareIcon,
      squareIconBg,
      logoDominantColor,
      squareIconFg,
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
    };

    // ── 14. Upload images to Vercel Blob (data URLs → public URLs) ──
    try {
      images = await uploadPortalImages(images, domain);
    } catch (e) {
      console.error("[customize] blob upload failed, returning data URLs:", e);
      // images stays as data URLs — still usable, just larger
    }

    const finalData: PortalData = {
      companyName,
      colors,
      images,
      welcomeMessage,
    };

    return ok(finalData);
  } catch (error) {
    console.error("[customize] pipeline error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    const partial = buildPartial();
    const hasPartial = Object.keys(partial).length > 0 && companyName !== "";
    return fail(errorMessage, hasPartial ? partial : null, 500);
  }
}
