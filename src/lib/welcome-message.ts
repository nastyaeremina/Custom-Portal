/**
 * Welcome Message Generator
 *
 * Produces a discipline-tailored welcome message for the Messages view
 * when we're highly confident about the company's industry.
 *
 * Falls back to a generic welcome when confidence is below threshold
 * or the discipline is "generic".
 *
 * Deterministic: same domain always picks the same template variant.
 */

import type { Discipline } from "./discipline/detector";
import { hashString } from "./discipline/hero-selector";

// ── Confidence gate ──────────────────────────────────────────────────
// Higher than hero image selection (0.55) because a wrong industry
// mention in text is more jarring than a slightly off-topic photo.
const MIN_CONFIDENCE = 0.65;

// ── Default fallback ─────────────────────────────────────────────────
// Used when discipline is "generic" or confidence is below threshold.
// Includes {companyName} for personalization and portal feature list.
const DEFAULT_TEMPLATE =
  "Welcome to {companyName}! We're excited to work together. Through our client portal, you can send messages, upload files, review contracts, complete forms, and manage billing — all in one place.";

// ── Discipline templates ─────────────────────────────────────────────
// Each discipline has 2 variants picked by domain hash.
// Pattern (borrowed from user's hand-written examples):
//   Sentence 1: "Welcome to {companyName}!" + value-prop for the industry
//   Sentence 2: Portal feature enumeration (discipline-relevant subset)
//   Sentence 3 (optional): outcome/closing
// Target: ~35–50 words, welcoming tone, {companyName} placeholder.

const TEMPLATES: Partial<Record<Discipline, string[]>> = {
  accounting: [
    "Welcome to {companyName}! We're here to help you stay on top of your financials with ease. Through our client portal, you can send messages, upload documents, review contracts, complete forms, and manage billing, ensuring a smooth and organized experience.",
    "Welcome to {companyName}! We're excited to support your accounting needs. In our client portal, you can send messages, upload files, review contracts, manage billing, and track tasks — keeping everything organized in one place.",
  ],
  legal: [
    "Welcome to {companyName}! We're committed to making your legal matters as seamless as possible. Through our client portal, you can send messages, share documents, review contracts, complete forms, and track case progress — all in one secure place.",
    "Welcome to {companyName}! We're here to support you through every step of the legal process. In our client portal, you can send messages, upload files, review contracts, manage billing, and stay up to date on your matters.",
  ],
  marketing: [
    "Welcome to {companyName}! We're excited to support your marketing initiatives. Through our client portal, you can send messages, upload files, review contracts, complete forms, and track project milestones — ensuring a seamless collaboration.",
    "Welcome to {companyName}! We're thrilled to partner with you on your marketing goals. In our client portal, you can send messages, share creative assets, review contracts, manage billing, and track campaign progress efficiently.",
  ],
  consulting: [
    "Welcome to {companyName}! We're looking forward to collaborating with you on your strategic goals. Through our client portal, you can send messages, upload files, review contracts, complete forms, and manage billing — all in one place.",
    "Welcome to {companyName}! We're excited to support your business objectives. In our client portal, you can send messages, share documents, review contracts, complete forms, and track project deliverables efficiently.",
  ],
  realestate: [
    "Welcome to {companyName}! We're here to make your real estate experience as smooth as possible. Through our client portal, you can send messages, upload documents, review contracts, manage billing, and track transaction progress — all in one place.",
    "Welcome to {companyName}! We're excited to guide you through every step of the process. In our client portal, you can send messages, share documents, review contracts, complete forms, and manage billing seamlessly.",
  ],
  technology: [
    "Welcome to {companyName}! We're excited to collaborate with you on your technology projects. Through our client portal, you can send messages, upload files, review contracts, complete forms, and track project progress — all in one place.",
    "Welcome to {companyName}! We're here to support your technical initiatives. In our client portal, you can send messages, share files, review contracts, manage billing, and stay on top of project milestones efficiently.",
  ],
  finance: [
    "Welcome to {companyName}! We're committed to helping you manage your finances with confidence. Through our client portal, you can send messages, upload documents, review contracts, manage billing, and track your financial progress — all in one place.",
    "Welcome to {companyName}! We're here to support your financial goals. In our client portal, you can send messages, upload files, review contracts, complete forms, and manage billing — keeping everything organized and accessible.",
  ],
  healthcare: [
    "Welcome to {companyName}! We're dedicated to supporting your health and well-being. Through our client portal, you can send messages, upload files, complete forms, review documents, and manage billing — ensuring a seamless care experience.",
    "Welcome to {companyName}! We're here to make your healthcare experience as smooth as possible. In our client portal, you can send messages, upload files, complete forms, manage billing, and stay connected with your care team.",
  ],
  education: [
    "Welcome to {companyName}! We're excited to support your learning journey. Through our client portal, you can send messages, upload files, complete forms, review materials, and track your progress — all in one place.",
    "Welcome to {companyName}! We're here to help you get the most out of your educational experience. In our client portal, you can send messages, upload files, complete forms, manage billing, and access resources efficiently.",
  ],
  operations: [
    "Welcome to {companyName}! We're here to help streamline your operations. Through our client portal, you can send messages, upload files, review contracts, complete forms, and manage billing — ensuring everything runs smoothly.",
    "Welcome to {companyName}! We're committed to keeping your projects on track. In our client portal, you can send messages, share documents, review contracts, manage billing, and track tasks — all in one place.",
  ],
};

// ── Public API ───────────────────────────────────────────────────────

export interface WelcomeMessageInput {
  companyName: string;
  discipline: string;
  confidence: number;
  /** Domain hostname for deterministic variant selection */
  domain: string;
}

export interface WelcomeMessageResult {
  text: string;
  source: "discipline" | "default";
}

/**
 * Generate a welcome message for the Messages view.
 *
 * When discipline confidence is high enough, returns an industry-tailored
 * message. Otherwise falls back to the generic default.
 */
export function generateWelcomeMessage(
  input: WelcomeMessageInput
): WelcomeMessageResult {
  const { companyName, discipline, confidence, domain } = input;

  // Gate: only tailor if confident and not generic
  if (discipline === "generic" || confidence < MIN_CONFIDENCE) {
    const text = DEFAULT_TEMPLATE.replace(/\{companyName\}/g, companyName);
    return { text, source: "default" };
  }

  const variants = TEMPLATES[discipline as Discipline];
  if (!variants || variants.length === 0) {
    const text = DEFAULT_TEMPLATE.replace(/\{companyName\}/g, companyName);
    return { text, source: "default" };
  }

  // Deterministic pick using domain hash (same domain → same variant)
  const index = hashString(domain) % variants.length;
  const template = variants[index];

  const text = template.replace(/\{companyName\}/g, companyName);

  return { text, source: "discipline" };
}
