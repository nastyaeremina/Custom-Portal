export interface ColorPalette {
  dominant: string;
  palette: string[];
}

export interface PortalColorScheme {
  sidebarBackground: string;
  sidebarText: string;
  accent: string;
}

/** Detailed color analysis used throughout the quality gate */
export interface ColorAnalysis {
  hex: string;
  hue: number; // 0-360
  saturation: number; // 0-1
  lightness: number; // 0-1
  luminance: number; // WCAG relative luminance 0-1
}

/** Result of a single quality gate check */
export interface QualityCheckResult {
  passed: boolean;
  detail: string;
}

/** Result of the quality gate validation */
export interface QualityGateResult {
  passed: boolean;
  checks: {
    sidebarNotNeutral: QualityCheckResult;
    accentVisible: QualityCheckResult;
    brandPreserved: QualityCheckResult;
    contrastPasses: QualityCheckResult;
    noGrayOnGray: QualityCheckResult;
    harmonyCheck: QualityCheckResult;
    accentSidebarDistinct: QualityCheckResult;
    antiTemplate: QualityCheckResult;
    brandVisibility: QualityCheckResult;
    accentUsability: QualityCheckResult;
  };
  adjustments: string[];
  originalColors: PortalColorScheme;
  finalColors: PortalColorScheme;
  iterations: number;
}

/** Extended accent result with saturation info for quality gate */
export interface ExtendedAccentResult {
  color: string | null;
  source: "squareIcon" | "logo" | "linkButton" | "none";
  isHighConfidence: boolean;
  saturation: number;
}

/** Full context passed into the quality gate */
export interface ColorGenerationContext {
  accentResult: ExtendedAccentResult;
  navHeaderBackground: string | null;
  logoSaturation: number | null;
  faviconSaturation: number | null;
  linkButtonColors: string[];
  allExtractedColors: string[];
}

/** Extended color scheme with quality gate metadata */
export interface ValidatedColorScheme extends PortalColorScheme {
  qualityGate: QualityGateResult;
  accentPromotion: boolean;
}
