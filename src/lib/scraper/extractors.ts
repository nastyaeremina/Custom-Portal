import { Page } from "puppeteer";
import { CompanyNameCandidate, ParkedDomainSignals, ScrapedImage } from "./types";

export async function extractFavicon(page: Page): Promise<string | null> {
  // Collect ALL candidate URLs from the DOM (ordered by preference)
  const candidateHrefs = await page.evaluate(() => {
    const sources: string[] = [];

    // 1. Apple touch icon (highest quality)
    const appleIcon = document.querySelector(
      'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
    );
    if (appleIcon) {
      const href = appleIcon.getAttribute("href");
      if (href) sources.push(href);
    }

    // 2. Large icon
    const largeIcon = document.querySelector('link[rel="icon"][sizes="192x192"], link[rel="icon"][sizes="180x180"], link[rel="icon"][sizes="152x152"]');
    if (largeIcon) {
      const href = largeIcon.getAttribute("href");
      if (href) sources.push(href);
    }

    // 3. Well-known /apple-touch-icon.png (many sites serve this even
    //    without declaring it in HTML; it's always a square PNG that
    //    Sharp can process, unlike .ico files which Sharp cannot read).
    //    Checked BEFORE standard icon links because those often point
    //    to .ico files that fail Sharp processing.
    sources.push("/apple-touch-icon.png");

    // 4. Standard icon links
    const icons = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    icons.forEach((icon) => {
      const href = icon.getAttribute("href");
      if (href) sources.push(href);
    });

    // 5. Fallback to /favicon.ico
    sources.push("/favicon.ico");

    return sources;
  });

  if (!candidateHrefs || candidateHrefs.length === 0) return null;

  const pageUrl = page.url();

  // Resolve to absolute URLs, dedup
  const seen = new Set<string>();
  const absoluteUrls: string[] = [];
  for (const href of candidateHrefs) {
    try {
      const abs = new URL(href, pageUrl).href;
      if (!seen.has(abs)) {
        seen.add(abs);
        absoluteUrls.push(abs);
      }
    } catch {
      // skip malformed URLs
    }
  }

  // Iterate candidates: first one that passes the quality gate wins
  for (const url of absoluteUrls) {
    // data: URLs (inline SVG/PNG from page) are always valid
    if (url.startsWith("data:")) return url;

    try {
      // Try HEAD first (cheap), fall back to GET if HEAD is rejected
      let response: Response;
      try {
        response = await fetch(url, {
          method: "HEAD",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandScraper/1.0)" },
          signal: AbortSignal.timeout(4000),
        });
      } catch {
        response = await fetch(url, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandScraper/1.0)" },
          signal: AbortSignal.timeout(4000),
        });
      }

      // Require 2xx
      if (!response.ok) continue;

      // Require image Content-Type (reject text/html 404 pages)
      const ct = (response.headers.get("content-type") || "").toLowerCase();
      if (!ct.startsWith("image/") && !ct.includes("icon")) continue;
      if (ct.startsWith("text/")) continue;

      return url;
    } catch {
      // Network error / timeout — skip to next candidate
      continue;
    }
  }

  // None passed — return the first candidate anyway as a last resort
  // (the browser may still be able to render it)
  return absoluteUrls[0] || null;
}

export async function extractLogo(page: Page): Promise<string | null> {
  const logoUrl = await page.evaluate(() => {
    const candidates: Array<{ src: string; score: number }> = [];

    // Helper to convert SVG element to data URL
    const svgToDataUrl = (svg: SVGSVGElement): string | null => {
      try {
        // Clone the SVG to avoid modifying the original
        const clone = svg.cloneNode(true) as SVGSVGElement;

        // Ensure SVG has xmlns attribute
        if (!clone.getAttribute("xmlns")) {
          clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }

        // Get computed styles and inline them for colors
        const computedStyle = window.getComputedStyle(svg);
        const fill = computedStyle.fill;
        const color = computedStyle.color;

        // If fill is not set on the SVG, try to set it from computed style
        if (!clone.getAttribute("fill") && fill && fill !== "none") {
          clone.setAttribute("fill", fill);
        }

        // Serialize to string
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clone);

        // Convert to data URL
        const encoded = encodeURIComponent(svgString)
          .replace(/'/g, "%27")
          .replace(/"/g, "%22");

        return `data:image/svg+xml,${encoded}`;
      } catch {
        return null;
      }
    };

    // Helper to check if element is inside a customer/partner section
    const isInCustomerSection = (el: Element): boolean => {
      let parent = el.parentElement;
      let depth = 0;
      while (parent && depth < 10) {
        const classAndId = `${parent.className} ${parent.id}`.toLowerCase();
        const text = parent.textContent?.toLowerCase().slice(0, 200) || "";

        // Check for customer/partner/trusted-by sections
        const customerPatterns = [
          "customer", "client", "partner", "trusted", "company", "brand",
          "carousel", "slider", "marquee", "logo-strip", "logo-wall",
          "testimonial", "case-stud", "featured", "used-by", "loved-by",
          "powering", "join", "companies"
        ];

        for (const pattern of customerPatterns) {
          if (classAndId.includes(pattern)) return true;
        }

        // Check common section text patterns
        if (text.includes("trusted by") || text.includes("used by") ||
            text.includes("loved by") || text.includes("powering") ||
            text.includes("our customers") || text.includes("our clients") ||
            text.includes("companies use") || text.includes("teams use")) {
          return true;
        }

        parent = parent.parentElement;
        depth++;
      }
      return false;
    };

    // Helper to check if this looks like the main site logo
    const isLikelyMainLogo = (img: HTMLImageElement): boolean => {
      const src = img.src.toLowerCase();
      const alt = (img.alt || "").toLowerCase();
      const className = img.className.toLowerCase();
      const id = img.id.toLowerCase();

      // Positive signals for main logo
      const positivePatterns = ["logo", "brand", "site-logo", "header-logo", "navbar-logo"];
      for (const pattern of positivePatterns) {
        if (src.includes(pattern) || alt.includes(pattern) ||
            className.includes(pattern) || id.includes(pattern)) {
          return true;
        }
      }
      return false;
    };

    // Helper to get vertical position (logos are usually at top)
    const getVerticalPosition = (el: Element): number => {
      const rect = el.getBoundingClientRect();
      return rect.top;
    };

    // Check if an image is logo-sized: loaded (naturalWidth > 15) and
    // displayed at a reasonable logo size (rendered width < 500px).
    // We use rendered width for the upper bound because modern sites
    // serve @2x/@3x images with naturalWidth 2-4x the display size
    // (e.g. Next.js /_next/image serves a 200px logo at naturalWidth 1938px).
    const isLogoSized = (img: HTMLImageElement): boolean => {
      if (img.naturalWidth <= 15) return false;
      const rendered = img.getBoundingClientRect().width;
      return rendered > 0 && rendered < 500;
    };

    // Helper: check if a link points to the site's home page.
    // Many sites use href="/" but some (especially Wix) use the full
    // origin URL like href="https://www.sbmmedia.au".
    const origin = window.location.origin; // e.g. "https://www.sbmmedia.au"
    const isHomeLink = (a: Element): boolean => {
      const href = a.getAttribute("href");
      if (!href) return false;
      if (href === "/" || href === "./") return true;
      // Match full origin with optional trailing slash
      try {
        const resolved = new URL(href, origin);
        return resolved.origin === origin && (resolved.pathname === "/" || resolved.pathname === "");
      } catch {
        return false;
      }
    };

    // Collect all home-pointing links inside header/nav for Strategy 1
    const headerNavEls = document.querySelectorAll("header, nav");
    const headerLogoLinks: Element[] = [];
    headerNavEls.forEach((container) => {
      container.querySelectorAll("a").forEach((a) => {
        if (isHomeLink(a) || /logo/i.test(a.className) || /logo/i.test(a.id)) {
          headerLogoLinks.push(a);
        }
      });
    });

    headerLogoLinks.forEach((link) => {
      const img = link.querySelector("img");
      if (img) {
        const imgEl = img as HTMLImageElement;
        if (imgEl.src && isLogoSized(imgEl)) {
          if (!isInCustomerSection(imgEl)) {
            candidates.push({ src: imgEl.src, score: 25 }); // Highest score
          }
        }
      }
    });

    // Strategy 2: Look for images with explicit logo class/id that are NOT in customer sections
    const explicitLogoImages = document.querySelectorAll(
      'img[class*="logo" i], img[id*="logo" i], [class*="logo" i] > img, [id*="logo" i] > img'
    );

    explicitLogoImages.forEach((img) => {
      const imgEl = img as HTMLImageElement;
      if (imgEl.src && isLogoSized(imgEl)) {
        if (isInCustomerSection(imgEl)) {
          // Skip customer logos entirely
          return;
        }

        let score = 15;

        // Boost if it's in header/nav
        const isInHeader = imgEl.closest("header") !== null;
        const isInNav = imgEl.closest("nav") !== null;
        if (isInHeader || isInNav) score += 5;

        // Boost if near top of page
        if (getVerticalPosition(imgEl) < 150) score += 3;

        // Boost if it looks like the main logo
        if (isLikelyMainLogo(imgEl)) score += 3;

        candidates.push({ src: imgEl.src, score });
      }
    });

    // Strategy 3: First image directly in header (not nested in sections)
    const header = document.querySelector("header");
    if (header) {
      // Get direct children or images within first couple levels
      const headerImages = header.querySelectorAll(":scope > img, :scope > a > img, :scope > div > img, :scope > div > a > img");
      headerImages.forEach((img, index) => {
        const imgEl = img as HTMLImageElement;
        if (imgEl.src && isLogoSized(imgEl)) {
          if (!isInCustomerSection(imgEl)) {
            // First image in header gets higher score
            candidates.push({ src: imgEl.src, score: 12 - index });
          }
        }
      });

      // Strategy 3b: Images inside home-pointing links anywhere in header.
      // Wix and other builders nest logos deeply (header > div > div > a > img).
      // The shallow selectors above miss these, so fall back to finding any
      // <a> in the header that points home and contains an <img>.
      header.querySelectorAll("a").forEach((a) => {
        if (!isHomeLink(a)) return;
        const img = a.querySelector("img") as HTMLImageElement | null;
        if (img && img.src && isLogoSized(img) && !isInCustomerSection(img)) {
          let score = 20;
          if (getVerticalPosition(img) < 150) score += 3;
          if (isLikelyMainLogo(img)) score += 3;
          candidates.push({ src: img.src, score });
        }
      });
    }

    // Strategy 4: Images with "logo" in src URL (but not customer-related paths)
    const allImages = document.querySelectorAll("img");
    allImages.forEach((img) => {
      const imgEl = img as HTMLImageElement;
      const srcLower = imgEl.src.toLowerCase();

      // Skip if in customer section
      if (isInCustomerSection(imgEl)) return;

      // Skip if src suggests it's a customer logo
      const customerUrlPatterns = ["customer", "client", "partner", "testimonial", "case-study"];
      for (const pattern of customerUrlPatterns) {
        if (srcLower.includes(pattern)) return;
      }

      if (
        srcLower.includes("logo") &&
        isLogoSized(imgEl)
      ) {
        let score = 8;
        if (getVerticalPosition(imgEl) < 150) score += 2;
        candidates.push({ src: imgEl.src, score });
      }
    });

    // Strategy 5: SVG in home links at the top of the page (highest priority for sites without header/nav)
    // This catches sites like assembly.com that use div-based navigation
    const allLinks = document.querySelectorAll("a");
    const homeLinks = Array.from(allLinks).filter(isHomeLink);
    homeLinks.forEach((link) => {
      const linkRect = link.getBoundingClientRect();
      // Only consider links near the top of the page (likely navigation)
      if (linkRect.top > 150) return;

      const svg = link.querySelector("svg");
      if (svg) {
        const svgEl = svg as SVGSVGElement;
        if (isInCustomerSection(svgEl)) return;

        const bbox = svgEl.getBoundingClientRect();
        if (bbox.width < 20 || bbox.width > 500) return;
        if (bbox.height < 10 || bbox.height > 200) return;

        const dataUrl = svgToDataUrl(svgEl);
        if (dataUrl) {
          // Very high score for SVG in home link at top of page
          let score = 30;
          if (bbox.top < 100) score += 5;
          candidates.push({ src: dataUrl, score });
        }
      }

      // Also check for img in home links at top
      const img = link.querySelector("img") as HTMLImageElement | null;
      if (img && img.src && isLogoSized(img)) {
        if (!isInCustomerSection(img)) {
          let score = 28;
          if (linkRect.top < 100) score += 5;
          candidates.push({ src: img.src, score });
        }
      }
    });

    // Strategy 6: SVG logos in header/nav (many modern sites like Stripe use inline SVG)
    const headerNav = document.querySelectorAll("header, nav");
    headerNav.forEach((container) => {
      // Look for SVGs that are direct children or in logo-related links
      const svgSelectors = [
        ':scope > a[href="/"] svg',
        ':scope > a[href="./"] svg',
        ':scope > div > a[href="/"] svg',
        ':scope a[class*="logo" i] svg',
        ':scope a[id*="logo" i] svg',
        ':scope [class*="logo" i] svg',
        ':scope [id*="logo" i] svg',
        ':scope > a > svg',
        ':scope > div > a > svg',
        ':scope > svg',
      ];

      svgSelectors.forEach((selector, selectorIndex) => {
        try {
          const svgs = container.querySelectorAll(selector);
          svgs.forEach((svg, index) => {
            const svgEl = svg as SVGSVGElement;
            if (isInCustomerSection(svgEl)) return;

            // Get SVG dimensions
            const bbox = svgEl.getBoundingClientRect();
            if (bbox.width < 20 || bbox.width > 500) return;
            if (bbox.height < 10 || bbox.height > 200) return;

            const dataUrl = svgToDataUrl(svgEl);
            if (dataUrl) {
              // Higher score for earlier selectors (more specific)
              let score = 20 - selectorIndex - index;
              if (getVerticalPosition(svgEl) < 150) score += 3;
              candidates.push({ src: dataUrl, score });
            }
          });
        } catch {
          // Selector might not be valid for this container
        }
      });
    });

    // Strategy 6b: SVG inside home-pointing links in header/nav (any depth).
    // CSS selectors above can't match full-URL hrefs like "https://site.com",
    // so we programmatically find home links and check for SVGs.
    headerNav.forEach((container) => {
      container.querySelectorAll("a").forEach((a) => {
        if (!isHomeLink(a)) return;
        const svg = a.querySelector("svg") as SVGSVGElement | null;
        if (!svg || isInCustomerSection(svg)) return;
        const bbox = svg.getBoundingClientRect();
        if (bbox.width < 20 || bbox.width > 500) return;
        if (bbox.height < 10 || bbox.height > 200) return;
        const dataUrl = svgToDataUrl(svg);
        if (dataUrl) {
          let score = 22;
          if (getVerticalPosition(svg) < 150) score += 3;
          candidates.push({ src: dataUrl, score });
        }
      });
    });

    // Strategy 7: Any SVG with logo in class/id (not in customer section)
    const logoSvgs = document.querySelectorAll(
      'svg[class*="logo" i], svg[id*="logo" i], [class*="logo" i] > svg, [id*="logo" i] > svg'
    );
    logoSvgs.forEach((svg) => {
      const svgEl = svg as SVGSVGElement;
      if (isInCustomerSection(svgEl)) return;

      const bbox = svgEl.getBoundingClientRect();
      if (bbox.width < 20 || bbox.width > 500) return;
      if (bbox.height < 10 || bbox.height > 200) return;

      const dataUrl = svgToDataUrl(svgEl);
      if (dataUrl) {
        let score = 10;
        if (getVerticalPosition(svgEl) < 150) score += 3;
        if (svgEl.closest("header") || svgEl.closest("nav")) score += 5;
        candidates.push({ src: dataUrl, score });
      }
    });

    // Dedupe by src and sort by score
    const seen = new Set<string>();
    const deduped = candidates.filter((c) => {
      if (seen.has(c.src)) return false;
      seen.add(c.src);
      return true;
    });

    deduped.sort((a, b) => b.score - a.score);
    return deduped[0]?.src || null;
  });

  return logoUrl;
}

/**
 * Extract data from the Web App Manifest (manifest.json).
 *
 * Returns:
 *   - icons: up to 3 absolute URLs of high-quality icons (≥ 128 px), largest first
 *   - name: `manifest.name` (the full app name)
 *   - shortName: `manifest.short_name` (abbreviated app name)
 *
 * Both name fields are useful company-name candidates (trust: "manifest").
 */
export interface ManifestData {
  icons: string[];
  name: string | null;
  shortName: string | null;
}

export async function extractManifestData(page: Page): Promise<ManifestData> {
  const empty: ManifestData = { icons: [], name: null, shortName: null };

  const manifestHref = await page.evaluate(() => {
    const link = document.querySelector('link[rel="manifest"]');
    return link?.getAttribute("href") || null;
  });

  if (!manifestHref) return empty;

  const pageUrl = page.url();
  let manifestUrl: string;
  try {
    manifestUrl = new URL(manifestHref, pageUrl).href;
  } catch {
    return empty;
  }

  try {
    const response = await fetch(manifestUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BrandScraper/1.0)" },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return empty;

    const manifest = await response.json();

    // ── Name fields ────────────────────────────────────────────────
    const name = typeof manifest.name === "string" ? manifest.name.trim() || null : null;
    const shortName =
      typeof manifest.short_name === "string" ? manifest.short_name.trim() || null : null;

    // ── Icons ──────────────────────────────────────────────────────
    if (!manifest.icons || !Array.isArray(manifest.icons)) {
      return { icons: [], name, shortName };
    }

    // Parse size string like "192x192" into a number
    const parseSize = (sizes?: string): number => {
      if (!sizes) return 0;
      const match = sizes.match(/(\d+)x(\d+)/);
      if (!match) return 0;
      return Math.max(parseInt(match[1], 10), parseInt(match[2], 10));
    };

    const candidates: Array<{ url: string; size: number }> = [];

    for (const icon of manifest.icons) {
      if (!icon.src) continue;

      const size = parseSize(icon.sizes);
      // Only keep icons >= 128px (skip tiny ones)
      if (size < 128) continue;

      // Accept image/png, image/svg+xml, or unspecified type
      const type = (icon.type || "").toLowerCase();
      if (type && !type.startsWith("image/png") && !type.startsWith("image/svg")) continue;

      try {
        const absoluteUrl = new URL(icon.src, manifestUrl).href;
        candidates.push({ url: absoluteUrl, size });
      } catch {
        // skip malformed URL
      }
    }

    // Sort largest first, return up to 3
    candidates.sort((a, b) => b.size - a.size);
    const icons = candidates.slice(0, 3).map((c) => c.url);

    return { icons, name, shortName };
  } catch {
    // Network error, JSON parse error, timeout
    return empty;
  }
}

export async function extractOgImage(page: Page): Promise<string | null> {
  const ogImage = await page.evaluate(() => {
    const og = document.querySelector('meta[property="og:image"]');
    return og?.getAttribute("content") || null;
  });

  if (!ogImage) return null;

  try {
    return new URL(ogImage, page.url()).href;
  } catch {
    return null;
  }
}

export async function extractHeroImages(page: Page): Promise<ScrapedImage[]> {
  const images = await page.evaluate(() => {
    const candidates: Array<{
      url: string;
      width: number;
      height: number;
    }> = [];
    const seen = new Set<string>();

    /** Add a candidate if the URL is new and non-empty. */
    function add(url: string, w: number, h: number) {
      if (!url || url === "about:blank" || seen.has(url)) return;
      seen.add(url);
      candidates.push({ url, width: w, height: h });
    }

    /**
     * Parse the largest URL from a `srcset` string.
     * Format: "url 600w, url 1200w" or "url 1x, url 2x"
     */
    function bestFromSrcset(srcset: string): string | null {
      const entries = srcset
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      let best: { url: string; size: number } | null = null;
      for (const entry of entries) {
        const parts = entry.split(/\s+/);
        if (parts.length < 1) continue;
        const url = parts[0];
        const descriptor = parts[1] ?? "0w";
        const size = parseFloat(descriptor) || 0;
        if (!best || size > best.size) {
          best = { url, size };
        }
      }
      return best?.url ?? null;
    }

    // ─── Strategy 1: <img> elements with loaded natural dimensions ───
    document.querySelectorAll("img").forEach((img) => {
      const imgEl = img as HTMLImageElement;

      // 1a. Fully-loaded large images (original logic)
      if (imgEl.naturalWidth >= 400 && imgEl.naturalHeight >= 300) {
        add(imgEl.src, imgEl.naturalWidth, imgEl.naturalHeight);
      }

      // 1b. Lazy-loaded images: check data-src, data-lazy-src, data-original
      //     These may not have naturalWidth yet because the real src hasn't loaded.
      const lazySrc =
        imgEl.getAttribute("data-src") ||
        imgEl.getAttribute("data-lazy-src") ||
        imgEl.getAttribute("data-original");
      if (lazySrc && lazySrc !== imgEl.src) {
        // Use HTML width/height attributes or rendered size as dimension estimate
        const w = imgEl.naturalWidth || imgEl.width || parseInt(imgEl.getAttribute("width") ?? "0", 10);
        const h = imgEl.naturalHeight || imgEl.height || parseInt(imgEl.getAttribute("height") ?? "0", 10);
        // Resolve relative URLs
        try {
          const resolved = new URL(lazySrc, window.location.href).href;
          add(resolved, w, h);
        } catch { /* invalid URL, skip */ }
      }

      // 1c. srcset — pick the largest source
      const srcset = imgEl.getAttribute("srcset") || imgEl.getAttribute("data-srcset");
      if (srcset) {
        const bestUrl = bestFromSrcset(srcset);
        if (bestUrl && bestUrl !== imgEl.src) {
          try {
            const resolved = new URL(bestUrl, window.location.href).href;
            const w = imgEl.naturalWidth || imgEl.width || 0;
            const h = imgEl.naturalHeight || imgEl.height || 0;
            add(resolved, w, h);
          } catch { /* invalid URL, skip */ }
        }
      }
    });

    // ─── Strategy 2: <picture> → <source> elements ───
    document.querySelectorAll("picture > source").forEach((source) => {
      const srcset = source.getAttribute("srcset");
      if (!srcset) return;
      const bestUrl = bestFromSrcset(srcset);
      if (bestUrl) {
        try {
          const resolved = new URL(bestUrl, window.location.href).href;
          // Dimensions unknown; the quality gate will check after fetch
          add(resolved, 0, 0);
        } catch { /* skip */ }
      }
    });

    // ─── Strategy 3: Inline-style background images (original logic) ───
    const elementsWithBg = document.querySelectorAll(
      '[style*="background-image"], [style*="background:"]'
    );
    elementsWithBg.forEach((el) => {
      const style = (el as HTMLElement).style.backgroundImage;
      const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (match && match[1]) {
        add(match[1], 0, 0);
      }
    });

    // ─── Strategy 4: Computed CSS background-image on large elements ───
    // Catches backgrounds set via stylesheets (not inline), common on hero sections.
    const heroSelectors = [
      "section", "[class*='hero']", "[class*='banner']", "[class*='cover']",
      "[class*='background']", "[role='banner']", "main > div:first-child",
    ];
    try {
      document.querySelectorAll(heroSelectors.join(", ")).forEach((el) => {
        const htmlEl = el as HTMLElement;
        // Only check sizeable elements (likely hero areas)
        if (htmlEl.offsetWidth < 400 || htmlEl.offsetHeight < 200) return;
        const computed = window.getComputedStyle(htmlEl);
        const bgImage = computed.backgroundImage;
        if (!bgImage || bgImage === "none") return;
        const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (match && match[1]) {
          add(match[1], htmlEl.offsetWidth, htmlEl.offsetHeight);
        }
      });
    } catch { /* computed styles can throw in edge cases */ }

    return candidates;
  });

  return images.map((img) => ({
    ...img,
    type: "hero" as const,
  }));
}

export interface ColorWithUsage {
  color: string;
  count: number;
  sources: string[];
}

export async function extractColors(page: Page): Promise<string[]> {
  const result = await extractColorsWithUsage(page);
  return result.map(c => c.color);
}

export async function extractColorsWithUsage(page: Page): Promise<ColorWithUsage[]> {
  const colors = await page.evaluate(() => {
    const colorMap = new Map<string, { count: number; sources: Set<string> }>();

    // Helper to convert rgb to hex
    const rgbToHex = (rgb: string): string | null => {
      const match = rgb.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)/
      );
      if (!match) return null;
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    };

    // Helper to normalize hex
    const normalizeHex = (hex: string): string => {
      if (hex.length === 4) {
        return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
      }
      return hex.toLowerCase();
    };

    // Helper to add color with source
    const addColor = (hex: string, source: string) => {
      const normalized = normalizeHex(hex);
      if (!colorMap.has(normalized)) {
        colorMap.set(normalized, { count: 0, sources: new Set() });
      }
      const entry = colorMap.get(normalized)!;
      entry.count++;
      entry.sources.add(source);
    };

    // Get computed styles from key elements
    const selectors = [
      { selector: "body", source: "body" },
      { selector: "header", source: "header" },
      { selector: "nav", source: "nav" },
      { selector: "main", source: "main" },
      { selector: "footer", source: "footer" },
      { selector: "h1", source: "headings" },
      { selector: "h2", source: "headings" },
      { selector: "a", source: "links" },
      { selector: "button", source: "buttons" },
      { selector: '[class*="btn"]', source: "buttons" },
      { selector: '[class*="primary"]', source: "primary" },
      { selector: '[class*="brand"]', source: "brand" },
    ];

    selectors.forEach(({ selector, source }) => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        if (!el) return;
        const styles = window.getComputedStyle(el);

        ["color", "background-color", "border-color"].forEach((prop) => {
          const value = styles.getPropertyValue(prop);
          if (
            value &&
            value !== "rgba(0, 0, 0, 0)" &&
            value !== "transparent" &&
            !value.includes("initial")
          ) {
            const hex = rgbToHex(value);
            if (hex) addColor(hex, source);
          }
        });
      });
    });

    // Parse stylesheets for hex colors
    Array.from(document.styleSheets).forEach((sheet) => {
      try {
        Array.from(sheet.cssRules).forEach((rule) => {
          const text = rule.cssText;
          // Extract hex colors
          const hexMatches = text.match(/#[0-9a-fA-F]{3,6}(?![0-9a-fA-F])/g);
          hexMatches?.forEach((c) => {
            addColor(c, "stylesheet");
          });
        });
      } catch {
        // CORS-blocked stylesheets
      }
    });

    // Convert to array format for return
    return Array.from(colorMap.entries()).map(([color, data]) => ({
      color,
      count: data.count,
      sources: Array.from(data.sources),
    }));
  });

  // Sort by count (most used first)
  return colors.sort((a, b) => b.count - a.count);
}

/**
 * Extract colors specifically from links and buttons for accent fallback
 * Returns colors sorted by frequency (most common first)
 */
export async function extractLinkButtonColors(page: Page): Promise<string[]> {
  const colors = await page.evaluate(() => {
    const colorCounts = new Map<string, number>();

    // Helper to convert rgb to hex
    const rgbToHex = (rgb: string): string | null => {
      const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    };

    // Helper to normalize hex
    const normalizeHex = (hex: string): string => {
      if (hex.length === 4) {
        return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.toLowerCase();
      }
      return hex.toLowerCase();
    };

    // Helper to add color with count
    const addColor = (hex: string) => {
      const normalized = normalizeHex(hex);
      colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1);
    };

    // Get colors from links
    document.querySelectorAll("a").forEach((el) => {
      const styles = window.getComputedStyle(el);
      const color = styles.getPropertyValue("color");
      const bgColor = styles.getPropertyValue("background-color");

      if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
        const hex = rgbToHex(color);
        if (hex) addColor(hex);
      }
      if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
        const hex = rgbToHex(bgColor);
        if (hex) addColor(hex);
      }
    });

    // Get colors from buttons
    document.querySelectorAll('button, [class*="btn"], [role="button"]').forEach((el) => {
      const styles = window.getComputedStyle(el);
      const color = styles.getPropertyValue("color");
      const bgColor = styles.getPropertyValue("background-color");

      if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
        const hex = rgbToHex(color);
        if (hex) addColor(hex);
      }
      if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
        const hex = rgbToHex(bgColor);
        if (hex) addColor(hex);
      }
    });

    // Convert to array sorted by frequency
    return Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color);
  });

  return colors;
}

/**
 * Extract the nav/header background color for sidebar selection
 * Returns the background color of nav or header element
 */
export async function extractNavHeaderBackground(page: Page): Promise<string | null> {
  const bgColor = await page.evaluate(() => {
    // Helper to convert rgb to hex
    const rgbToHex = (rgb: string): string | null => {
      const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return null;
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    };

    // Helper to check if color is transparent or not set
    const isTransparent = (color: string): boolean => {
      return !color ||
        color === "rgba(0, 0, 0, 0)" ||
        color === "transparent" ||
        color.includes("initial");
    };

    // Try nav first
    const nav = document.querySelector("nav");
    if (nav) {
      const styles = window.getComputedStyle(nav);
      const bgColor = styles.getPropertyValue("background-color");
      if (!isTransparent(bgColor)) {
        return rgbToHex(bgColor);
      }

      // Check first div child inside nav
      const firstDiv = nav.querySelector("div");
      if (firstDiv) {
        const divStyles = window.getComputedStyle(firstDiv);
        const divBg = divStyles.getPropertyValue("background-color");
        if (!isTransparent(divBg)) {
          return rgbToHex(divBg);
        }
      }
    }

    // Try header
    const header = document.querySelector("header");
    if (header) {
      const styles = window.getComputedStyle(header);
      const bgColor = styles.getPropertyValue("background-color");
      if (!isTransparent(bgColor)) {
        return rgbToHex(bgColor);
      }

      // Check first div child inside header
      const firstDiv = header.querySelector("div");
      if (firstDiv) {
        const divStyles = window.getComputedStyle(firstDiv);
        const divBg = divStyles.getPropertyValue("background-color");
        if (!isTransparent(divBg)) {
          return rgbToHex(divBg);
        }
      }
    }

    return null;
  });

  return bgColor;
}

export async function extractMetadata(
  page: Page
): Promise<{ title: string | null; description: string | null; meta: Record<string, string> }> {
  return page.evaluate(() => {
    const title = document.title || null;

    const descriptionEl = document.querySelector(
      'meta[name="description"], meta[property="og:description"]'
    );
    const description = descriptionEl?.getAttribute("content") || null;

    const meta: Record<string, string> = {};

    // Collect various meta tags
    const metaTags = [
      'meta[property="og:title"]',
      'meta[property="og:site_name"]',
      'meta[name="application-name"]',
      'meta[name="author"]',
    ];

    metaTags.forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) {
        const name = el.getAttribute("property") || el.getAttribute("name") || "unknown";
        const content = el.getAttribute("content");
        if (content) {
          meta[name] = content;
        }
      }
    });

    return { title, description, meta };
  });
}

/**
 * Collect company-name candidates from multiple DOM sources.
 *
 * Each candidate carries a `source` tag so the downstream scoring
 * system can assign trust-based weights.  All values are trimmed and
 * truncated to 200 chars.  Duplicates (same value+source) are removed.
 *
 * Sources gathered (in rough trust order):
 *   1. Schema.org LD+JSON  → Organization / WebSite `name`
 *   2. og:site_name        → meta[property="og:site_name"]
 *   3. application-name    → meta[name="application-name"]
 *   4. header brand text   → textContent of first <a href="/"> in <header>/<nav>
 *   5. logo alt text       → alt of first logo-like <img> in header/nav
 *   6. og:title            → meta[property="og:title"]
 *   7. title               → document.title
 */
export async function extractCompanyNameCandidates(
  page: Page
): Promise<CompanyNameCandidate[]> {
  try {
    const raw = await page.evaluate(() => {
      const candidates: Array<{ value: string; source: string; parentSource?: string }> = [];

      const add = (value: string | null | undefined, source: string) => {
        if (!value) return;
        const trimmed = value.trim().substring(0, 200);
        if (trimmed.length === 0) return;
        candidates.push({ value: trimmed, source });
      };

      // ── 1. Schema.org LD+JSON ──────────────────────────────────────
      try {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        scripts.forEach((script) => {
          try {
            const json = JSON.parse(script.textContent || "");

            // Handle @graph arrays and single objects
            const items = Array.isArray(json)
              ? json
              : json?.["@graph"] && Array.isArray(json["@graph"])
                ? json["@graph"]
                : [json];

            for (const item of items) {
              if (!item) continue;
              const type = item["@type"];
              // Accept Organization, Corporation, WebSite, LocalBusiness, etc.
              const isRelevant =
                typeof type === "string" &&
                /^(Organization|Corporation|WebSite|LocalBusiness|Store|Restaurant|MedicalBusiness|EducationalOrganization|GovernmentOrganization|NGO|SportsOrganization)$/i.test(type);

              if (isRelevant && typeof item.name === "string") {
                add(item.name, "schema-org");
              }

              // Also check publisher.name (common in Article schemas)
              if (item.publisher && typeof item.publisher.name === "string") {
                add(item.publisher.name, "schema-org");
              }
            }
          } catch {
            // Invalid JSON — skip this script tag
          }
        });
      } catch {
        // querySelectorAll failed — skip schema.org
      }

      // ── 2. og:site_name ────────────────────────────────────────────
      const ogSiteName = document
        .querySelector('meta[property="og:site_name"]')
        ?.getAttribute("content");
      add(ogSiteName, "og:site_name");

      // ── 3. application-name ────────────────────────────────────────
      const appName = document
        .querySelector('meta[name="application-name"]')
        ?.getAttribute("content");
      add(appName, "application-name");

      // ── 4. Header brand text ───────────────────────────────────────
      // Look for the first <a> that links to "/" or the site root inside
      // <header> or <nav>.  Its textContent is often the brand name.
      try {
        // Common navigation labels that are never a company name.
        // Checked against header-brand candidates to avoid picking up
        // generic nav items (especially on Webflow/portfolio sites).
        const NAV_WORDS = new Set([
          "work", "works", "home", "about", "contact", "blog", "news",
          "portfolio", "projects", "services", "products", "pricing",
          "faq", "careers", "jobs", "team", "login", "sign in", "sign up",
          "register", "shop", "store", "help", "support", "menu",
          "resources", "gallery", "events", "testimonials", "reviews",
          "case studies", "clients",
        ]);

        const headerNav = document.querySelector("header") || document.querySelector("nav");
        if (headerNav) {
          const hbOrigin = window.location.origin;
          const allHbLinks = headerNav.querySelectorAll("a");
          const homeLinks = Array.from(allHbLinks).filter((a) => {
            const href = a.getAttribute("href");
            if (!href) return false;
            if (href === "/" || href === "./") return true;
            try {
              const resolved = new URL(href, hbOrigin);
              return resolved.origin === hbOrigin && (resolved.pathname === "/" || resolved.pathname === "");
            } catch { return false; }
          });
          for (const link of homeLinks) {
            let text = (link as HTMLElement).textContent?.trim() || "";
            if (text.length < 2 || text.length > 100) continue;

            // Collapse whitespace for cleaner matching
            text = text.replace(/\s+/g, " ");

            // Webflow hover-swap pattern: link text is duplicated for
            // hover animations.  Two variants:
            //   1. With space:  "Work Work" (textContent of two inline elements)
            //   2. Without space: "WorkWork"  (textContent of two <p>/<div> elements)
            const spaceWords = text.split(" ");
            if (spaceWords.length === 2 && spaceWords[0].toLowerCase() === spaceWords[1].toLowerCase()) {
              text = spaceWords[0];
            }
            // Check for concatenated duplicate (e.g. "WorkWork" → "Work")
            if (spaceWords.length === 1 && text.length >= 4 && text.length % 2 === 0) {
              const half = text.length / 2;
              const first = text.substring(0, half);
              const second = text.substring(half);
              if (first.toLowerCase() === second.toLowerCase()) {
                text = first;
              }
            }

            // Skip generic navigation labels
            if (NAV_WORDS.has(text.toLowerCase())) continue;

            add(text, "header-brand");
            break; // Only take the first valid one
          }
        }
      } catch {
        // Skip header brand extraction
      }

      // ── 5. Logo alt text ───────────────────────────────────────────
      // Find first <img> in header/nav whose class/id/alt hints at "logo".
      try {
        const headerNav = document.querySelector("header") || document.querySelector("nav");
        if (headerNav) {
          const imgs = headerNav.querySelectorAll("img");
          for (const img of imgs) {
            const alt = img.getAttribute("alt") || "";
            const cls = img.className || "";
            const id = img.id || "";
            const src = img.getAttribute("src") || "";
            const isLogoImg =
              /logo/i.test(alt) || /logo/i.test(cls) || /logo/i.test(id) || /logo/i.test(src);

            if (isLogoImg) {
              // Skip generic values like "logo", "company logo", "site logo"
              const cleaned = alt.replace(/\s*(logo|icon|image|img)\s*/gi, "").trim();
              if (cleaned.length >= 2) {
                add(cleaned, "logo-alt");
                break;
              }
            }
          }
        }
      } catch {
        // Skip logo alt extraction
      }

      // ── 6. og:title ───────────────────────────────────────────────
      const ogTitle = document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content");
      add(ogTitle, "og:title");

      // ── 7. document.title ──────────────────────────────────────────
      if (document.title) {
        add(document.title, "title");
      }

      // ── Deduplicate (same value + source) ──────────────────────────
      const seen = new Set<string>();
      const deduped: Array<{ value: string; source: string }> = [];
      for (const c of candidates) {
        const key = `${c.source}::${c.value}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(c);
        }
      }

      return deduped;
    });
    // Cast: page.evaluate returns plain objects with string source,
    // but we know the values match CompanyNameSource literals.
    return raw as CompanyNameCandidate[];
  } catch (error) {
    console.warn("extractCompanyNameCandidates failed:", error);
    return [];
  }
}

// ─── Parked / Placeholder Domain Detection ────────────────────────────

/**
 * Known hosting/registrar brand names.  If any of these appear in the page
 * title or body AND the input domain does NOT contain the same string,
 * the page is very likely a hosting placeholder.
 */
const HOSTING_PROVIDERS = [
  "websupport", "godaddy", "namecheap", "bluehost", "hostgator",
  "siteground", "dreamhost", "ionos", "hostinger", "wix",
  "squarespace", "wordpress.com", "weebly",
  "plesk", "cpanel", "directadmin", "cloudflare",
  "sedoparking", "hugedomains", "dan.com", "afternic",
  "1and1", "register.com", "name.com", "hover",
  "networksolutions", "enom", "tucows", "domain.com",
  "fasthosts", "123-reg", "one.com", "strato",
  "ovh", "hetzner", "contabo", "linode",
  "parking", "parked",
];

/**
 * Regex patterns that strongly indicate a parked / placeholder page.
 * Each match adds PARKED_PHRASE_SCORE to the total.
 */
const PARKED_PHRASES: RegExp[] = [
  /this\s+domain\s+(is|has\s+been)\s+(parked|registered)/i,
  /domain\s+(is\s+)?for\s+sale/i,
  /buy\s+this\s+domain/i,
  /domain\s+owner/i,
  /this\s+web(site|page)?\s+is\s+(under\s+construction|coming\s+soon)/i,
  /parked\s+(by|domain|page|free)/i,
  /future\s+home\s+of/i,
  /website\s+coming\s+soon/i,
  /nothing\s+(to\s+see\s+)?here\s+yet/i,
  /site\s+not\s+(yet\s+)?available/i,
  /web\s+hosting\s+placeholder/i,
  /congratulations.*new\s+domain/i,
  /your\s+new\s+site/i,
  /get\s+started\s+with\s+(your\s+)?website/i,
  /this\s+is\s+a\s+default\s+(page|website)/i,
  /set\s+up\s+a\s+new\s+domain/i,
  /no\s+content\s+is\s+displayed/i,
  /upload\/?delete\s+the\s+existing\s+content/i,
];

// Score constants
const HOSTING_PROVIDER_SCORE = 40;
const PARKED_PHRASE_SCORE = 25;
const SPARSE_CONTENT_SCORE = 30;
const DOMAIN_MISMATCH_SCORE = 35;
const DEFAULT_PAGE_MARKER_SCORE = 20;
const PARKED_THRESHOLD = 50;

export interface ParkedDomainResult {
  isParked: boolean;
  score: number;
  threshold: number;
  signals: string[];
}

/**
 * Detect whether the current page is a hosting-provider placeholder
 * (parked domain) rather than the actual company's website.
 *
 * Uses a weighted scoring system — multiple weak signals or one strong
 * signal is required to flag the page, minimising false positives.
 */
export async function detectParkedDomain(
  page: Page,
  inputUrl: string
): Promise<ParkedDomainResult> {
  const signals: string[] = [];
  let score = 0;

  // ── Extract all page data in a single evaluate round-trip ──
  const pageData = await page.evaluate(() => {
    const title = document.title || "";
    const metaDesc =
      document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    const metaGenerator =
      document.querySelector('meta[name="generator"]')?.getAttribute("content") || "";
    const ogSiteName =
      document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || "";

    // Visible body text (first 3000 chars to keep it fast)
    const bodyText = (document.body?.innerText || "").substring(0, 3000);

    // Check for parking-specific selectors
    const hasParkingSelectors = !!(
      document.querySelector('[class*="parking" i]') ||
      document.querySelector('[class*="placeholder" i]') ||
      document.querySelector('[id*="parking" i]') ||
      document.querySelector('[id*="placeholder" i]')
    );

    // Check for cpanel / plesk generator tags
    const hasCpanelPlesk = !!(
      document.querySelector('meta[name="generator"][content*="plesk" i]') ||
      document.querySelector('meta[name="generator"][content*="cpanel" i]')
    );

    return {
      title,
      metaDesc,
      metaGenerator,
      ogSiteName,
      bodyText,
      hasParkingSelectors,
      hasCpanelPlesk,
    };
  });

  // ── Derive the domain stem for mismatch checks ──
  let domainStem = "";
  try {
    domainStem = new URL(inputUrl).hostname
      .replace(/^www\./, "")
      .split(".")[0]
      .toLowerCase();
  } catch {
    /* ignore bad URL */
  }

  // Combine all text sources for provider search
  const allText = [
    pageData.title,
    pageData.metaDesc,
    pageData.metaGenerator,
    pageData.ogSiteName,
    pageData.bodyText,
  ]
    .join(" ")
    .toLowerCase();

  // ── Signal A: Known hosting provider in page text ──
  const matchedProviders: string[] = [];
  for (const provider of HOSTING_PROVIDERS) {
    if (allText.includes(provider)) {
      // Check that the domain itself does NOT contain the provider name
      // (avoids flagging godaddy.com as parked)
      if (!domainStem.includes(provider.replace(/\./g, ""))) {
        matchedProviders.push(provider);
      }
    }
  }
  if (matchedProviders.length > 0) {
    score += HOSTING_PROVIDER_SCORE;
    signals.push(`hosting-provider: ${matchedProviders.join(", ")}`);
  }

  // ── Signal B: Parked keyword phrases ──
  const matchedPhrases: string[] = [];
  for (const re of PARKED_PHRASES) {
    if (re.test(pageData.bodyText) || re.test(pageData.title)) {
      matchedPhrases.push(re.source.substring(0, 40));
    }
  }
  if (matchedPhrases.length > 0) {
    // Only add the score once (not per phrase) to avoid over-weighting
    score += PARKED_PHRASE_SCORE;
    signals.push(`parked-phrases: ${matchedPhrases.length} match(es)`);
  }

  // ── Signal C: Sparse content ──
  const visibleText = pageData.bodyText.replace(/\s+/g, "");
  if (visibleText.length < 200) {
    score += SPARSE_CONTENT_SCORE;
    signals.push(`sparse-content: ${visibleText.length} chars`);
  }

  // ── Signal D: Domain-name mismatch with hosting provider ──
  // The page title or og:site_name is a known provider AND has zero
  // overlap with the domain stem.
  if (domainStem.length >= 3) {
    const titleLower = pageData.title.toLowerCase();
    const ogNameLower = pageData.ogSiteName.toLowerCase();
    const titleOrOg = titleLower + " " + ogNameLower;

    const titleIsProvider = HOSTING_PROVIDERS.some((p) => titleOrOg.includes(p));
    const domainInTitle = titleOrOg.includes(domainStem);

    if (titleIsProvider && !domainInTitle) {
      score += DOMAIN_MISMATCH_SCORE;
      signals.push(`domain-mismatch: title/og has provider, no "${domainStem}"`);
    }
  }

  // ── Signal E: Default-page HTML markers ──
  if (pageData.hasParkingSelectors || pageData.hasCpanelPlesk) {
    score += DEFAULT_PAGE_MARKER_SCORE;
    const markers = [
      pageData.hasParkingSelectors && "parking/placeholder selectors",
      pageData.hasCpanelPlesk && "cpanel/plesk generator",
    ].filter(Boolean);
    signals.push(`html-markers: ${markers.join(", ")}`);
  }

  return {
    isParked: score >= PARKED_THRESHOLD,
    score,
    threshold: PARKED_THRESHOLD,
    signals,
  };
}
