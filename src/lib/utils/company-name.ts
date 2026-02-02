const LEGALESE_PATTERNS = [
  /,?\s*(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|company|co\.?|limited|incorporated|plc\.?)$/i,
  /\s*-\s*.+$/, // Remove taglines after dash
  /\s*\|.+$/, // Remove taglines after pipe
  /\s*–.+$/, // Remove taglines after en-dash
  /\s*:.+$/, // Remove subtitles after colon
];

export function cleanCompanyName(rawName: string | null | undefined): string {
  if (!rawName) return "Company";

  let cleaned = rawName.trim();

  // Remove common legalese and taglines
  for (const pattern of LEGALESE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Trim whitespace
  cleaned = cleaned.trim();

  // If we ended up with nothing, return a default
  if (!cleaned) return "Company";

  return cleaned;
}
