import { Page } from "puppeteer";
import { ScrapedImage } from "./types";

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

    // Strategy 1: Look for the logo link in header (usually wraps the logo)
    const headerLogoLinks = document.querySelectorAll(
      'header a[href="/"], header a[href="./"], header a[class*="logo" i], header a[id*="logo" i], nav a[href="/"], nav a[href="./"]'
    );

    headerLogoLinks.forEach((link) => {
      const img = link.querySelector("img");
      if (img) {
        const imgEl = img as HTMLImageElement;
        if (imgEl.src && imgEl.naturalWidth > 15 && imgEl.naturalWidth < 500) {
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
      if (imgEl.src && imgEl.naturalWidth > 15 && imgEl.naturalWidth < 500) {
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
        if (imgEl.src && imgEl.naturalWidth > 15 && imgEl.naturalWidth < 500) {
          if (!isInCustomerSection(imgEl)) {
            // First image in header gets higher score
            candidates.push({ src: imgEl.src, score: 12 - index });
          }
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
        imgEl.naturalWidth > 15 &&
        imgEl.naturalWidth < 500
      ) {
        let score = 8;
        if (getVerticalPosition(imgEl) < 150) score += 2;
        candidates.push({ src: imgEl.src, score });
      }
    });

    // Strategy 5: SVG in home links at the top of the page (highest priority for sites without header/nav)
    // This catches sites like assembly.com that use div-based navigation
    const homeLinks = document.querySelectorAll('a[href="/"], a[href="./"]');
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
      if (img && img.src && img.naturalWidth > 15 && img.naturalWidth < 500) {
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

    // Look for large images
    document.querySelectorAll("img").forEach((img) => {
      const imgEl = img as HTMLImageElement;
      if (imgEl.naturalWidth >= 400 && imgEl.naturalHeight >= 300) {
        candidates.push({
          url: imgEl.src,
          width: imgEl.naturalWidth,
          height: imgEl.naturalHeight,
        });
      }
    });

    // Look for background images in CSS
    const elementsWithBg = document.querySelectorAll(
      '[style*="background-image"], [style*="background:"]'
    );
    elementsWithBg.forEach((el) => {
      const style = (el as HTMLElement).style.backgroundImage;
      const match = style.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (match && match[1]) {
        candidates.push({
          url: match[1],
          width: 0,
          height: 0,
        });
      }
    });

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
