import { z } from "zod";

export const GenerateRequestSchema = z.object({
  input: z.string().min(1, "Input is required"),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

export interface PortalColors {
  sidebarBackground: string;
  sidebarText: string;
  accent: string;
}

export interface PortalImages {
  squareIcon: string | null;
  /** Dominant background color of the squareIcon (hex, e.g. "#2c2c3e").
   *  Used to fill the message-avatar container so the logo blends seamlessly. */
  squareIconBg: string | null;
  /** Dominant foreground (logo) colour of the squareIcon (hex, e.g. "#2055a4").
   *  Used to contrast-check proposed avatar backgrounds and avoid blue-on-blue etc. */
  logoDominantColor: string | null;
  fullLogo: string | null;
  loginImage: string | null;
  /** Dashboard hero banner image (gradient generated from brand colors). */
  dashboardImage: string | null;
  socialImage: string | null;
  /** Raw favicon URL from scraper (unprocessed passthrough for fallback) */
  rawFaviconUrl: string | null;
  /** Raw logo URL from scraper (unprocessed passthrough for fallback) */
  rawLogoUrl: string | null;
}

export interface PortalData {
  companyName: string;
  colors: PortalColors;
  images: PortalImages;
  /** Welcome message for the Messages view (discipline-tailored or default). */
  welcomeMessage: string;
}

export interface ColorWithUsage {
  color: string;
  count: number;
  sources: string[];
}

export interface DalleGeneration {
  approach: "logo_centered" | "accent_wave" | "gradient" | "og_extended";
  prompt: string;
  imageUrl: string | null;
  status: "pending" | "generating" | "complete" | "error";
  error?: string;
}

export interface RawOutputs {
  scrapedColors: ColorWithUsage[];
  scrapedImages: Array<{ url: string; width?: number; height?: number; type?: string }>;
  extractedMeta: Record<string, string>;
  colorThiefPalette: string[];
  generatedWithDalle: boolean;
  faviconUrl: string | null;
  logoUrl: string | null;
  dalleImageUrl: string | null;
  dalleGenerations?: DalleGeneration[];
  accentColorSource?: "squareIcon" | "logo" | "linkButton" | "none";
  accentColorConfidence?: "high" | "low";
  navHeaderBackground?: string | null;
  sidebarColorSource?: "navHeader" | "accent" | "default";
  qualityGateResult?: {
    passed: boolean;
    checks: Record<string, { passed: boolean; detail: string }>;
    adjustments: string[];
    iterations: number;
    originalColors: { sidebarBackground: string; sidebarText: string; accent: string };
  };
  accentPromotion?: boolean;
  /** Discipline detection debug snapshot */
  disciplineDetection?: {
    discipline: string;
    confidence: number;
    signals: string[];
    heroSelection: {
      selected: boolean;
      imageUrl: string | null;
      reason: string;
      availableCount: number;
      chosenIndex: number;
    };
    /** Which source provided the login image: "discipline" | "gradient" | "generic" */
    loginImageSource: string;
    /** Which source provided the dashboard image: "gradient" | "generic" | "generic_same_as_login" */
    dashboardImageSource?: string;
  };
  /** Gradient generation debug snapshot */
  gradientDebug?: {
    /** "extracted" = brand colors used, "preset" = curated fallback palette */
    mode: "extracted" | "preset";
    /** CSS angle in degrees (e.g. 168) */
    angle: number;
    /** Final hex stops used in the gradient */
    stops: string[];
    /** Why this mode was chosen */
    reason: string;
    /** Preset name if mode=preset */
    presetName?: string;
    /** Original input colors before guardrails */
    inputColors?: string[];
  };
  /** Palette diversity score (determines gradient vs library photo) */
  diversityScore?: {
    score: number;
    useGradient: boolean;
    reason: string;
  };
  /** Company name selection debug info */
  companyNameDebug?: {
    selectedName: string;
    candidates: Array<{
      value: string;
      source: string;
      parentSource?: string;
      score: number;
      reasons: string[];
    }>;
  };
  /** Brand mark selection debug info */
  brandMarkSelection?: {
    candidates: Array<{
      url: string;
      source: string;
      totalScore: number;
      scores: {
        aspect: number;
        resolution: number;
        complexity: number;
        source: number;
        monogram: number;
      };
      disqualified: boolean;
      disqualifyReason?: string;
    }>;
    selectedSource: string | null;
    fallbackToInitials: boolean;
    log: string[];
  };
  /** OG image evaluation for login hero */
  ogHeroEvaluation?: {
    ogImageUrl: string | null;
    passed: boolean;
    score: {
      scores: {
        resolution: number;
        aspectRatio: number;
        complexity: number;
        area: number;
        edgeDensity: number;
        spatialSpread: number;
      };
      total: number;
      passed: boolean;
      reasons: string[];
    } | null;
  };
  /** Scraped hero image evaluation (fallback when OG image fails) */
  scrapedHeroEvaluation?: {
    passed: boolean;
    imageUrl: string | null;
    candidatesConsidered: number;
    candidatesTried: number;
    score: {
      scores: {
        resolution: number;
        aspectRatio: number;
        complexity: number;
        area: number;
        edgeDensity: number;
        spatialSpread: number;
      };
      total: number;
      passed: boolean;
      reasons: string[];
    } | null;
  };
  /** Welcome message source: "discipline" if tailored, "default" if generic */
  welcomeMessageSource?: "discipline" | "default";
  /** Parked / placeholder domain detection debug info */
  parkedDomainDetection?: {
    isParked: boolean;
    score: number;
    threshold: number;
    signals: string[];
  };
}

export interface GenerateResponse {
  success: boolean;
  data?: PortalData;
  rawOutputs?: RawOutputs;
  error?: string;
}
