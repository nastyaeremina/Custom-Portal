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
    /** Which source provided the login image: "library" | "gradient" | "static" */
    loginImageSource: string;
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
}

export interface GenerateResponse {
  success: boolean;
  data?: PortalData;
  rawOutputs?: RawOutputs;
  error?: string;
}
