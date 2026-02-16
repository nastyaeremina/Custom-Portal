export interface ScrapedImage {
  url: string;
  width?: number;
  height?: number;
  type: "favicon" | "logo" | "og" | "hero" | "background";
}

export interface ColorWithUsage {
  color: string;
  count: number;
  sources: string[];
}

export type CompanyNameSource =
  | "schema-org"
  | "og:site_name"
  | "application-name"
  | "manifest"
  | "og:title"
  | "title"
  | "logo-alt"
  | "header-brand"
  | "segment";

export interface CompanyNameCandidate {
  /** Raw text value extracted from the source */
  value: string;
  /** Where this candidate came from — used for trust scoring */
  source: CompanyNameSource;
  /** For "segment" candidates: which parent source it was split from */
  parentSource?: string;
}

export interface ParkedDomainSignals {
  score: number;
  threshold: number;
  signals: string[];
}

export interface ScrapedData {
  url: string;
  title: string | null;
  description: string | null;
  favicon: string | null;
  logo: string | null;
  ogImage: string | null;
  /** High-quality icons from Web App Manifest (manifest.json), sorted largest first. */
  manifestIcons: string[];
  images: ScrapedImage[];
  colors: string[];
  colorsWithUsage: ColorWithUsage[];
  linkButtonColors: string[];
  navHeaderBackground: string | null;
  meta: Record<string, string>;
  /** All company-name candidates collected from various page sources */
  companyNameCandidates: CompanyNameCandidate[];
  /** True if the page appears to be a parked/placeholder domain */
  isParkedDomain: boolean;
  /** Debug info about parked domain detection */
  parkedDomainSignals?: ParkedDomainSignals;
}
