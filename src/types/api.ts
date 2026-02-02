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
  fullLogo: string | null;
  loginImage: string | null;
  socialImage: string | null;
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
  approach: "logo_centered" | "accent_wave" | "gradient";
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
}

export interface GenerateResponse {
  success: boolean;
  data?: PortalData;
  rawOutputs?: RawOutputs;
  error?: string;
}
