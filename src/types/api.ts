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

export interface RawOutputs {
  scrapedColors: string[];
  scrapedImages: Array<{ url: string; width?: number; height?: number }>;
  extractedMeta: Record<string, string>;
  colorThiefPalette: string[];
  generatedWithDalle: boolean;
  faviconUrl: string | null;
  logoUrl: string | null;
  dalleImageUrl: string | null;
}

export interface GenerateResponse {
  success: boolean;
  data?: PortalData;
  rawOutputs?: RawOutputs;
  error?: string;
}
