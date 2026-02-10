export function parseInput(input: string): string {
  const trimmed = input.trim();

  // Handle email format (extract domain)
  if (trimmed.includes("@") && !trimmed.includes("://")) {
    const domain = trimmed.split("@")[1];
    if (domain) {
      return `https://${domain}`;
    }
  }

  // Already a full URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  // Just a domain
  return `https://${trimmed}`;
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function isValidUrl(input: string): boolean {
  try {
    const url = parseInput(input);
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/* ─── Personal email provider blocklist ─── */
const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.jp",
  "yahoo.fr",
  "yahoo.de",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "outlook.co.uk",
  "live.com",
  "msn.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "yandex.com",
  "mail.com",
  "zoho.com",
  "gmx.com",
  "gmx.net",
  "inbox.com",
  "fastmail.com",
  "tutanota.com",
  "hey.com",
]);

/** Check whether a hostname has a valid TLD (≥ 2 chars after last dot). */
function hasValidTld(hostname: string): boolean {
  const dot = hostname.lastIndexOf(".");
  if (dot === -1) return false;
  const tld = hostname.slice(dot + 1);
  return tld.length >= 2;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates user input (website URL or work email).
 * Returns `{ valid: true }` or `{ valid: false, error: "..." }` with a
 * user-facing message.
 */
export function validateInput(input: string): ValidationResult {
  const trimmed = input.trim();

  // 1. Empty
  if (!trimmed) {
    return { valid: false, error: "Please enter a website or email." };
  }

  // 2. Detect email vs domain
  const isEmail = trimmed.includes("@") && !trimmed.includes("://");

  if (isEmail) {
    // ── Email path ──
    const parts = trimmed.split("@");
    const domain = parts[parts.length - 1]?.toLowerCase();

    if (!domain || !domain.includes(".")) {
      return {
        valid: false,
        error: "Invalid email domain. Try a different email or website.",
      };
    }

    // TLD check (e.g. "nyu.ed" → .ed is only 2 chars but we want ≥ 2, so it passes;
    // however single-char TLDs like ".e" won't)
    if (!hasValidTld(domain)) {
      return {
        valid: false,
        error: "Invalid email domain. Try a different email or website.",
      };
    }

    // Personal email blocklist
    if (PERSONAL_EMAIL_DOMAINS.has(domain)) {
      return {
        valid: false,
        error: "Please use a work email or company website.",
      };
    }

    // Try to construct a valid URL from the domain
    try {
      new URL(`https://${domain}`);
    } catch {
      return {
        valid: false,
        error: "Invalid email domain. Try a different email or website.",
      };
    }

    return { valid: true };
  }

  // ── Domain / URL path ──
  try {
    const url = parseInput(trimmed);
    const parsed = new URL(url);

    if (!hasValidTld(parsed.hostname)) {
      return {
        valid: false,
        error: "Enter a valid email domain or company website.",
      };
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: "Enter a valid email domain or company website.",
    };
  }
}
