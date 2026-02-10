/**
 * Discipline Detector
 *
 * Classifies a scraped website into one of the curated discipline
 * categories used for login hero image selection.
 *
 * Detection is keyword-based and deterministic — same input always
 * produces the same output.  Returns a confidence score (0–1).
 *
 * The caller decides the confidence threshold; this module never
 * falls back silently.
 */

export const DISCIPLINES = [
  "accounting",
  "legal",
  "marketing",
  "consulting",
  "realestate",
  "technology",
  "finance",
  "healthcare",
  "education",
  "operations",
  "generic",
] as const;

export type Discipline = (typeof DISCIPLINES)[number];

export interface DisciplineResult {
  /** Detected discipline slug */
  discipline: Discipline;
  /** 0–1 confidence score */
  confidence: number;
  /** Which signals contributed (for debug) */
  signals: string[];
}

/** Input derived from ScrapedData + URL */
export interface DisciplineInput {
  /** The scraped page URL */
  url: string;
  /** <title> tag content */
  title: string | null;
  /** meta description */
  description: string | null;
  /** All extracted meta tags (og:title, og:site_name, etc.) */
  meta: Record<string, string>;
}

// ── Keyword banks ──────────────────────────────────────────────────
// Each entry: [keyword/phrase, weight (0.05–0.30)]
// Weights reflect how strongly a keyword indicates a discipline.
// A domain-slug match gets a bonus on top.

type KeywordEntry = [pattern: string, weight: number];

const KEYWORD_BANKS: Record<Exclude<Discipline, "generic">, KeywordEntry[]> = {
  accounting: [
    ["accounting", 0.30],
    ["bookkeeping", 0.30],
    ["cpa", 0.25],
    ["tax preparation", 0.25],
    ["tax advisory", 0.25],
    ["tax filing", 0.20],
    ["audit", 0.15],
    ["payroll", 0.15],
    ["financial statement", 0.15],
    ["gaap", 0.20],
    ["enrolled agent", 0.20],
    ["quickbooks", 0.10],
    ["xero", 0.10],
    ["accounts receivable", 0.15],
    ["accounts payable", 0.15],
  ],
  legal: [
    ["law firm", 0.30],
    ["attorney", 0.30],
    ["lawyer", 0.30],
    ["legal services", 0.30],
    ["litigation", 0.25],
    ["legal counsel", 0.25],
    ["paralegal", 0.20],
    ["family law", 0.25],
    ["corporate law", 0.25],
    ["intellectual property", 0.20],
    ["immigration law", 0.25],
    ["estate planning", 0.20],
    ["personal injury", 0.20],
    ["notary", 0.15],
    ["legal practice", 0.25],
  ],
  marketing: [
    ["marketing agency", 0.30],
    ["digital marketing", 0.30],
    ["creative agency", 0.30],
    ["advertising agency", 0.25],
    ["branding agency", 0.25],
    ["social media marketing", 0.25],
    ["seo agency", 0.25],
    ["content marketing", 0.20],
    ["graphic design", 0.20],
    ["web design agency", 0.20],
    ["pr agency", 0.20],
    ["public relations", 0.20],
    ["brand strategy", 0.20],
    ["media buying", 0.15],
    ["copywriting", 0.15],
  ],
  consulting: [
    ["consulting firm", 0.30],
    ["management consulting", 0.30],
    ["strategy consulting", 0.30],
    ["business consulting", 0.30],
    ["fractional", 0.25],
    ["advisory firm", 0.25],
    ["consultancy", 0.25],
    ["business strategy", 0.20],
    ["transformation", 0.10],
    ["change management", 0.15],
    ["operational excellence", 0.15],
    ["management advisory", 0.20],
    ["strategic advisor", 0.20],
    ["consulting services", 0.25],
    ["executive coaching", 0.15],
  ],
  realestate: [
    ["real estate", 0.30],
    ["property management", 0.30],
    ["realty", 0.30],
    ["realtor", 0.30],
    ["rental management", 0.25],
    ["brokerage", 0.20],
    ["commercial property", 0.25],
    ["residential property", 0.25],
    ["property listing", 0.20],
    ["leasing", 0.15],
    ["mortgage", 0.15],
    ["home buying", 0.20],
    ["real estate agent", 0.30],
    ["property investment", 0.20],
    ["mls", 0.15],
  ],
  technology: [
    ["saas", 0.25],
    ["software company", 0.25],
    ["developer tools", 0.25],
    ["api platform", 0.25],
    ["cloud platform", 0.20],
    ["devops", 0.20],
    ["open source", 0.15],
    ["software development", 0.20],
    ["tech startup", 0.25],
    ["infrastructure", 0.10],
    ["platform", 0.08],
    ["developer", 0.10],
    ["sdk", 0.20],
    ["deploy", 0.10],
    ["engineering", 0.08],
  ],
  finance: [
    ["financial planning", 0.30],
    ["wealth management", 0.30],
    ["financial advisor", 0.30],
    ["investment management", 0.25],
    ["insurance broker", 0.25],
    ["insurance agency", 0.25],
    ["fintech", 0.25],
    ["financial services", 0.25],
    ["asset management", 0.20],
    ["portfolio management", 0.20],
    ["retirement planning", 0.20],
    ["fiduciary", 0.20],
    ["registered investment", 0.25],
    ["financial institution", 0.20],
    ["banking", 0.15],
  ],
  healthcare: [
    ["healthcare", 0.30],
    ["medical practice", 0.30],
    ["clinic", 0.20],
    ["telehealth", 0.25],
    ["health provider", 0.25],
    ["dental", 0.25],
    ["therapy", 0.15],
    ["therapist", 0.20],
    ["wellness", 0.15],
    ["patient portal", 0.30],
    ["hipaa", 0.25],
    ["mental health", 0.20],
    ["physician", 0.25],
    ["chiropractic", 0.25],
    ["optometry", 0.25],
  ],
  education: [
    ["edtech", 0.25],
    ["online learning", 0.25],
    ["education platform", 0.25],
    ["e-learning", 0.25],
    ["tutoring", 0.25],
    ["coaching", 0.15],
    ["training provider", 0.20],
    ["course", 0.10],
    ["curriculum", 0.20],
    ["lms", 0.20],
    ["learning management", 0.25],
    ["academy", 0.15],
    ["certification", 0.10],
    ["corporate training", 0.20],
    ["instructor", 0.10],
  ],
  operations: [
    ["operations management", 0.25],
    ["helpdesk", 0.20],
    ["it service", 0.20],
    ["managed service", 0.25],
    ["hr platform", 0.20],
    ["human resources", 0.20],
    ["procurement", 0.15],
    ["workforce management", 0.20],
    ["it management", 0.20],
    ["service desk", 0.20],
    ["facility management", 0.20],
    ["back office", 0.15],
    ["business process", 0.15],
    ["msp", 0.20],
    ["itsm", 0.20],
  ],
};

// ── Detection logic ────────────────────────────────────────────────

/**
 * Detect the discipline/industry of a scraped website.
 *
 * Returns the best-matching discipline with a confidence score.
 * Deterministic: same input → same output.
 */
export function detectDiscipline(input: DisciplineInput): DisciplineResult {
  // Build the text corpus from all available signals
  const parts: string[] = [];
  if (input.title) parts.push(input.title);
  if (input.description) parts.push(input.description);
  for (const value of Object.values(input.meta)) {
    if (value) parts.push(value);
  }
  // Include the domain itself (e.g. "collectivecpa.com" → contains "cpa")
  try {
    const hostname = new URL(input.url).hostname.replace(/^www\./, "");
    parts.push(hostname);
  } catch {
    // ignore bad URLs
  }

  const corpus = parts.join(" ").toLowerCase();

  if (!corpus.trim()) {
    return { discipline: "generic", confidence: 0, signals: ["no-text-available"] };
  }

  // Score each discipline
  const scores: Array<{
    discipline: Exclude<Discipline, "generic">;
    score: number;
    signals: string[];
  }> = [];

  for (const [discipline, keywords] of Object.entries(KEYWORD_BANKS) as Array<
    [Exclude<Discipline, "generic">, KeywordEntry[]]
  >) {
    let score = 0;
    const signals: string[] = [];

    for (const [pattern, weight] of keywords) {
      if (corpus.includes(pattern.toLowerCase())) {
        score += weight;
        signals.push(pattern);
      }
    }

    if (score > 0) {
      scores.push({ discipline, score, signals });
    }
  }

  // No matches at all → generic with 0 confidence
  if (scores.length === 0) {
    return { discipline: "generic", confidence: 0, signals: ["no-keyword-matches"] };
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const runnerUp = scores[1];

  // Convert raw score to 0–1 confidence
  // A score of 0.60+ is very confident; scale linearly with a cap at 1.0
  let confidence = Math.min(best.score / 0.60, 1.0);

  // Penalize if the runner-up is very close (ambiguous)
  if (runnerUp && runnerUp.score > 0) {
    const gap = best.score - runnerUp.score;
    const gapRatio = gap / best.score;
    // If the gap is less than 30% of the leader's score, reduce confidence
    if (gapRatio < 0.30) {
      confidence *= 0.7; // 30% penalty for ambiguity
    }
  }

  // Round to 2 decimal places for clean debug output
  confidence = Math.round(confidence * 100) / 100;

  return {
    discipline: best.discipline,
    confidence,
    signals: best.signals,
  };
}
