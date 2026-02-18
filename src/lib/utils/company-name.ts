import type { CompanyNameCandidate, CompanyNameSource } from "@/lib/scraper/types";

// ─── Legalese / tagline stripping ───────────────────────────────────────────

const LEGALESE_PATTERNS = [
  /(?:,\s*|\s+)(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|company|co\.?|limited|incorporated|plc\.?)$/i,
  /\s+[-]\s+.+$/, // Remove taglines after spaced dash  ("Acme - Best Software")
  //  ↑ Require spaces so "Hewlett-Packard" is preserved
  /\s*\|.+$/, // Remove taglines after pipe
  /\s*–.+$/, // Remove taglines after en-dash
  /\s*—.+$/, // Remove taglines after em-dash
  /\s*:.+$/, // Remove subtitles after colon
];

export function cleanCompanyName(rawName: string | null | undefined): string {
  if (!rawName) return "Company";

  let cleaned = rawName.trim();

  // Remove common legalese and taglines
  for (const pattern of LEGALESE_PATTERNS) {
    cleaned = cleaned.replace(pattern, "");
  }

  // Strip trailing periods (e.g. "vivo&co." → "vivo&co")
  cleaned = cleaned.replace(/\.+$/, "");

  // Trim whitespace
  cleaned = cleaned.trim();

  // If we ended up with nothing, return a default
  if (!cleaned) return "Company";

  return cleaned;
}

// ─── Scoring system ─────────────────────────────────────────────────────────

/** Trust scores for each source type (higher = more trustworthy). */
const SOURCE_TRUST: Record<CompanyNameSource, number> = {
  "schema-org": 100,
  "og:site_name": 90,
  "application-name": 85,
  manifest: 80,
  "header-brand": 70,
  "logo-alt": 65,
  "og:title": 40,
  title: 30,
  segment: 0, // computed dynamically from parent
};

/** Separator pattern used to split titles into segments. */
const SEPARATOR_RE = /\s*[|–—]\s*|\s+[-]\s+|\s*:\s+/;

/** Words that signal an SEO / marketing phrase rather than a company name. */
const SEO_WORDS = /\b(best|top|leading|official|#1|free|cheap|affordable|premium|exclusive|ultimate|guaranteed|trusted|award[- ]?winning)\b/i;

/** Phrases that start with a verb — likely a tagline, not a name. */
const VERB_START = /^(get|buy|find|discover|try|start|join|learn|build|create|make|shop|explore|sign|log|book|download|compare|save|grow|boost|unlock|transform|request)\b/i;

/** Single common words that are never a company name (nav labels, generic terms). */
const GENERIC_SINGLE_WORDS = /^(work|works|home|about|contact|blog|news|portfolio|projects|services|products|pricing|team|shop|store|help|support|menu|gallery|events|reviews|clients|digital|creative|studio|agency|design|global|solutions|consulting|group|media|online|web)$/i;

/** Multi-word generic phrases that are never a company name (page titles, nav labels). */
const GENERIC_PHRASES = /^(home\s*page|about\s+us|contact\s+us|our\s+(services|team|work|story|mission|vision|products|clients|portfolio)|welcome\s+(home|back|to)|main\s+page|landing\s+page|front\s+page|my\s+(account|dashboard|profile)|sign\s+in|log\s+in|get\s+(started|in\s+touch))$/i;

/** Location-prefixed descriptors: "City, ST ..." — SEO geo-qualifier, not a company name. */
const GEO_PREFIX = /^[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}\b/;

export interface ScoredCandidate {
  value: string;
  source: CompanyNameSource;
  parentSource?: string;
  score: number;
  reasons: string[];
}

export interface CompanyNameResult {
  name: string;
  candidates: ScoredCandidate[];
}

/**
 * Select the best company name from a set of candidates using trust-based scoring.
 *
 * Pipeline:
 *   1. Segment expansion — split candidates containing separators into sub-candidates
 *   2. Score each candidate
 *   3. Clean the top-scoring candidate with `cleanCompanyName()`
 *   4. If the cleaned result is empty, try the next candidate
 *   5. Final fallback: "Company"
 */
export function selectCompanyName(
  candidates: CompanyNameCandidate[]
): CompanyNameResult {
  if (candidates.length === 0) {
    return { name: "Company", candidates: [] };
  }

  // ── Step 1: Segment expansion ───────────────────────────────────────────
  const expanded: CompanyNameCandidate[] = [...candidates];

  for (const c of candidates) {
    if (c.source === "segment") continue; // Don't re-split segments

    const parts = c.value.split(SEPARATOR_RE).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      for (const part of parts) {
        expanded.push({
          value: part,
          source: "segment",
          parentSource: c.source,
        });
      }
    }
  }

  // ── Step 2: Score each candidate ────────────────────────────────────────
  const scored: ScoredCandidate[] = expanded.map((c) => {
    const reasons: string[] = [];
    let score = 0;

    // Base trust
    if (c.source === "segment") {
      const parentTrust = SOURCE_TRUST[(c.parentSource as CompanyNameSource) || "title"] || 30;
      score = Math.round(parentTrust * 0.7);
      reasons.push(`segment of ${c.parentSource} (${score})`);
    } else {
      score = SOURCE_TRUST[c.source] || 0;
      reasons.push(`base: ${score}`);
    }

    const val = c.value;

    // Length > 40 chars → likely a sentence/tagline
    if (val.length > 40) {
      score -= 30;
      reasons.push("long (>40): -30");
    }

    // Contains SEO/marketing words
    if (SEO_WORDS.test(val)) {
      score -= 25;
      reasons.push("seo-words: -25");
    }

    // Starts with a verb (tagline-like)
    if (VERB_START.test(val)) {
      score -= 20;
      reasons.push("verb-start: -20");
    }

    // Single generic word → unlikely to be a company name
    // Safety net for navigation labels or common words that slip through extraction
    if (GENERIC_SINGLE_WORDS.test(val.trim())) {
      score -= 30;
      reasons.push("generic-word: -30");
    }

    // Multi-word generic phrase → same penalty
    if (GENERIC_PHRASES.test(val.trim())) {
      score -= 30;
      reasons.push("generic-phrase: -30");
    }

    // Location-prefixed descriptor ("Spartanburg, SC Virtual Accounting Firm")
    // → SEO geo-qualifier, not a company name
    if (GEO_PREFIX.test(val.trim())) {
      score -= 20;
      reasons.push("geo-prefix: -20");
    }

    // More than 4 words → likely a phrase, not a name
    const wordCount = val.split(/\s+/).length;
    if (wordCount > 4) {
      score -= 15;
      reasons.push(`${wordCount} words: -15`);
    }

    // Too short (< 2 chars) → unreliable
    if (val.length < 2) {
      score -= 10;
      reasons.push("too-short: -10");
    }

    // Ideal name length: 2–20 chars
    if (val.length >= 2 && val.length <= 20) {
      score += 10;
      reasons.push("ideal-length: +10");
    }

    // Cross-validation: same value appears in another source
    const crossMatches = candidates.filter(
      (other) =>
        other.source !== c.source &&
        other.value.toLowerCase() === val.toLowerCase()
    ).length;
    if (crossMatches > 0) {
      const bonus = crossMatches * 20;
      score += bonus;
      reasons.push(`cross-validation (${crossMatches}): +${bonus}`);
    }

    return {
      value: c.value,
      source: c.source,
      parentSource: c.parentSource,
      score,
      reasons,
    };
  });

  // ── Step 3: Sort by score descending ────────────────────────────────────
  scored.sort((a, b) => b.score - a.score);

  // ── Step 4: Pick the best candidate that cleans to a non-empty string ──
  for (const candidate of scored) {
    const cleaned = cleanCompanyName(candidate.value);
    if (cleaned && cleaned !== "Company") {
      return { name: cleaned, candidates: scored };
    }
  }

  // ── Step 5: Fallback ───────────────────────────────────────────────────
  return { name: "Company", candidates: scored };
}
