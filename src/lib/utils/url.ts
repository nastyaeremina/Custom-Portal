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
