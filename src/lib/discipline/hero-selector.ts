/**
 * Hero Image Selector
 *
 * Given a discipline detection result and the domain, deterministically
 * selects a curated hero image from the local library.
 *
 * Selection order (as decided by the route):
 *   1. Discipline library image — only if confidence is high AND assets exist
 *   2. Gradient generator       — default fallback (handled by caller)
 *   3. Static fallback          — only if gradient fails (handled by caller)
 *
 * `generic/` is NOT the "unknown discipline" bucket.  It is only used when:
 *   - detector explicitly returns "generic" with confidence >= 0.85, OR
 *   - the ALLOW_GENERIC_LIBRARY env var / feature flag is set
 */

import fs from "fs";
import path from "path";
import type { Discipline, DisciplineResult } from "./detector";

// ── Configuration ──────────────────────────────────────────────────

/** Minimum confidence to use a discipline library image */
const DISCIPLINE_CONFIDENCE_THRESHOLD = 0.55;

/**
 * Minimum confidence to use the `generic/` library.
 * Much higher than other disciplines because "generic" should only
 * trigger when the detector is very sure nothing else fits.
 */
const GENERIC_CONFIDENCE_THRESHOLD = 0.85;

/** Feature flag: allow generic library images even below threshold */
const ALLOW_GENERIC_LIBRARY = process.env.ALLOW_GENERIC_LIBRARY === "true";

/** Root directory for hero image assets (relative to project root) */
const HERO_ASSETS_DIR = path.join(process.cwd(), "public", "assets", "login-hero");

// ── Types ──────────────────────────────────────────────────────────

export interface HeroSelectionResult {
  /** Whether a library image was selected */
  selected: boolean;
  /**
   * Public URL path to the image (e.g. "/assets/login-hero/accounting/03.jpg")
   * null if no image selected (caller should use gradient fallback)
   */
  imageUrl: string | null;
  /** The discipline that was evaluated */
  discipline: Discipline;
  /** Confidence score from the detector */
  confidence: number;
  /** Why this result was chosen (for debug) */
  reason: string;
  /** How many images were available in the folder */
  availableCount: number;
  /** Which image index was chosen (0-based, -1 if none) */
  chosenIndex: number;
}

// ── Core logic ─────────────────────────────────────────────────────

/**
 * Simple deterministic hash of a string → unsigned 32-bit integer.
 * Same string always produces the same number.
 * Uses djb2 (Dan Bernstein's algorithm).
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0; // unsigned
  }
  return hash;
}

/**
 * Extract the registrable domain from a URL for deterministic hashing.
 * "https://www.stripe.com/pricing" → "stripe.com"
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    // Strip www. prefix
    const noWww = hostname.replace(/^www\./, "");
    return noWww.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * List image files in a discipline folder.
 * Returns sorted file names (e.g. ["01.jpg", "02.jpg", ...]).
 * Returns empty array if the folder doesn't exist or is empty.
 */
function listHeroImages(discipline: Discipline): string[] {
  const dir = path.join(HERO_ASSETS_DIR, discipline);
  try {
    const files = fs.readdirSync(dir);
    return files
      .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Select a curated hero image for the login page.
 *
 * @param detection - Result from detectDiscipline()
 * @param url       - The original scraped URL (used for deterministic hashing)
 */
export function selectHeroImage(
  detection: DisciplineResult,
  url: string
): HeroSelectionResult {
  const { discipline, confidence } = detection;

  // ── Gate: generic has special rules ────────────────────────────
  if (discipline === "generic") {
    const genericAllowed =
      ALLOW_GENERIC_LIBRARY || confidence >= GENERIC_CONFIDENCE_THRESHOLD;

    if (!genericAllowed) {
      return {
        selected: false,
        imageUrl: null,
        discipline,
        confidence,
        reason: `generic requires confidence >= ${GENERIC_CONFIDENCE_THRESHOLD} or ALLOW_GENERIC_LIBRARY flag (got ${confidence})`,
        availableCount: 0,
        chosenIndex: -1,
      };
    }
  }

  // ── Gate: confidence threshold ─────────────────────────────────
  if (discipline !== "generic" && confidence < DISCIPLINE_CONFIDENCE_THRESHOLD) {
    return {
      selected: false,
      imageUrl: null,
      discipline,
      confidence,
      reason: `confidence ${confidence} below threshold ${DISCIPLINE_CONFIDENCE_THRESHOLD}`,
      availableCount: 0,
      chosenIndex: -1,
    };
  }

  // ── Gate: assets must exist ────────────────────────────────────
  const images = listHeroImages(discipline);
  if (images.length === 0) {
    return {
      selected: false,
      imageUrl: null,
      discipline,
      confidence,
      reason: `no images in ${discipline}/ folder`,
      availableCount: 0,
      chosenIndex: -1,
    };
  }

  // ── Deterministic selection: hash(domain) % count ─────────────
  const domain = extractDomain(url);
  const hash = hashString(domain);
  const index = hash % images.length;
  const chosenFile = images[index];

  const publicUrl = `/assets/login-hero/${discipline}/${chosenFile}`;

  return {
    selected: true,
    imageUrl: publicUrl,
    discipline,
    confidence,
    reason: `matched ${discipline} with confidence ${confidence}, hash("${domain}")=${hash} → index ${index}/${images.length}`,
    availableCount: images.length,
    chosenIndex: index,
  };
}
