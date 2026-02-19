import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

let browserInstance: Browser | null = null;

// Remote Chromium binary for serverless environments
const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    // Check if we're in a serverless environment (Vercel)
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

    if (isServerless) {
      // Use @sparticuz/chromium-min for serverless with remote binary
      browserInstance = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1920, height: 1080 },
        executablePath: await chromium.executablePath(CHROMIUM_REMOTE_URL),
        headless: true,
      });
    } else {
      // Use local Chrome for development
      // Try common Chrome paths
      const possiblePaths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
        "/usr/bin/google-chrome", // Linux
        "/usr/bin/chromium-browser", // Linux alternative
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // Windows
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", // Windows x86
      ];

      let executablePath: string | undefined;
      const fs = await import("fs");
      for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
          executablePath = path;
          break;
        }
      }

      browserInstance = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-features=site-per-process",
        ],
      });
    }
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

// User agents to try in order.  Some WAFs / bot-protection layers block
// headless Chrome, so we fall back to a simpler agent when we get a 4xx.
const USER_AGENTS = [
  // Primary: realistic Chrome
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  // Fallback: lightweight branded agent (matches extractFavicon's direct requests)
  "Mozilla/5.0 (compatible; BrandScraper/1.0)",
];

// ─── Third-party tracking / analytics domains to block ──────────────────────
// These fire dozens of network requests that delay `networkidle2` but
// contribute zero CSS or DOM content our extractors need.
// Only *script* resource-type requests to these domains are blocked;
// first-party scripts and all stylesheets/images pass through untouched.
const BLOCKED_THIRD_PARTY_DOMAINS = [
  // Analytics
  "google-analytics.com",
  "googletagmanager.com",
  "analytics.google.com",
  "ga.js",
  "gtag",
  // Advertising / remarketing
  "googlesyndication.com",
  "googleadservices.com",
  "doubleclick.net",
  "adservice.google.com",
  "facebook.net",
  "connect.facebook.net",
  "fbevents.js",
  "ads-twitter.com",
  "ads.linkedin.com",
  "snap.licdn.com",
  // Chat widgets
  "intercom.io",
  "intercomcdn.com",
  "drift.com",
  "crisp.chat",
  "livechatinc.com",
  "tawk.to",
  "zendesk.com",
  "zdassets.com",
  "freshdesk.com",
  "olark.com",
  // Marketing / tracking
  "hotjar.com",
  "fullstory.com",
  "mouseflow.com",
  "crazyegg.com",
  "optimizely.com",
  "segment.io",
  "segment.com",
  "mixpanel.com",
  "amplitude.com",
  "heapanalytics.com",
  "hubspot.com",
  "hs-scripts.com",
  "hs-analytics.net",
  "hsforms.com",
  "marketo.net",
  "marketo.com",
  "pardot.com",
  "munchkin.marketo.net",
  "clarity.ms",
  "sentry.io",
  "sentry-cdn.com",
  "newrelic.com",
  "nr-data.net",
  "datadoghq.com",
  "browser-intake-datadoghq.com",
  // A/B testing
  "abtasty.com",
  "vwo.com",
  // Consent / cookie banners (they add network requests, not brand content)
  "cookiebot.com",
  "onetrust.com",
  "cookielaw.org",
  "consent.cookiebot.com",
  // Social embeds / share widgets
  "platform.twitter.com",
  "platform.linkedin.com",
  "widgets.outbrain.com",
  "cdn.taboola.com",
  // CDN-based trackers
  "cdn.jsdelivr.net/npm/@clickup",
  "js.hs-banner.com",
  "bat.bing.com",
  "px.ads.linkedin.com",
  "sc-static.net",
];

/** Fast check: does a URL belong to a blocked third-party domain? */
function isBlockedThirdParty(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return BLOCKED_THIRD_PARTY_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d)
    );
  } catch {
    return false;
  }
}

/** Set up a fresh page with request interception and the given user agent. */
async function setupPage(browser: Browser, ua: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(ua);

  // Polyfill the esbuild `__name` helper that may leak into page.evaluate()
  // callbacks.  esbuild injects `__name(fn, "name")` for function-name
  // preservation, but that symbol doesn't exist in the browser context.
  // Defining it as a no-op identity function prevents ReferenceError.
  // IMPORTANT: must use a raw string, NOT a function callback — otherwise
  // esbuild transforms the callback itself and injects __name into it,
  // creating the same error we're trying to fix.
  await page.evaluateOnNewDocument(
    `if (typeof globalThis.__name === "undefined") { globalThis.__name = function(fn) { return fn; }; }`
  );

  // Block unnecessary resources to speed up loading
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();

    // Always block media, fonts, websockets — never needed
    if (["media", "font", "websocket"].includes(resourceType)) {
      req.abort();
      return;
    }

    // Block third-party tracking/analytics scripts — they fire dozens of
    // network requests that delay networkidle2 but contribute no brand
    // CSS or DOM content our extractors use.
    // Only block "script" type so first-party JS and all stylesheets pass.
    if (resourceType === "script" && isBlockedThirdParty(req.url())) {
      req.abort();
      return;
    }

    req.continue();
  });

  return page;
}

/**
 * Wait for most visible images to finish loading.
 * Framer, React, and Next.js sites often render images asynchronously
 * after the initial `networkidle2` fires.  This polls `img.complete`
 * for up to 2 seconds so `naturalWidth`/`naturalHeight` are populated
 * when `extractHeroImages` runs.
 *
 * Reduced from 3s → 2s: logos and above-fold images load quickly;
 * the remaining 20% are usually off-screen lazy images we don't need.
 */
async function waitForImages(page: Page): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const imgs = Array.from(document.images);
        if (imgs.length === 0) return true;
        const loaded = imgs.filter(
          (img) => img.complete || img.naturalWidth > 0
        ).length;
        // Pass when ≥80% of images are done (avoids stalling on broken imgs)
        return loaded / imgs.length >= 0.8;
      },
      { timeout: 2000 }
    );
  } catch {
    // Timeout is fine — we tried our best; proceed with whatever loaded
  }
}

export async function createPage(browser: Browser, url: string): Promise<Page> {
  // Try each user agent; retry on 4xx (typically 403 from WAFs)
  for (let i = 0; i < USER_AGENTS.length; i++) {
    const ua = USER_AGENTS[i];
    const page = await setupPage(browser, ua);

    // Use networkidle2 with a tighter timeout.  Third-party tracking
    // scripts are now blocked, so the network should settle much faster.
    // If it still takes >20s the page is likely very heavy with
    // remaining scripts — our extractors work fine with partial loads.
    let response;
    try {
      response = await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: 20000,
      });
    } catch (navError: unknown) {
      // Navigation timeout — fall back to whatever state the page is in.
      // The DOM and stylesheets are almost certainly loaded by 20s;
      // the timeout usually means a few long-poll / streaming requests
      // are still open.
      const isTimeout = navError instanceof Error && navError.message.includes("timeout");
      if (isTimeout) {
        console.warn(`[scraper] networkidle2 timed out for ${url}, proceeding with current page state`);
        await waitForImages(page);
        return page;
      }
      // Non-timeout navigation errors (DNS failure, etc.) — rethrow
      throw navError;
    }

    const status = response?.status() ?? 0;

    // Usable response (2xx/3xx or server errors that won't change with a different UA)
    if (status === 0 || status < 400 || status >= 500) {
      // Wait for images to finish loading (helps Framer/React/Next.js sites
      // where images render asynchronously after network idle)
      await waitForImages(page);
      return page;
    }

    // 4xx — close this page and try the next user agent
    const isLast = i === USER_AGENTS.length - 1;
    if (!isLast) {
      console.warn(
        `[scraper] HTTP ${status} for ${url} with UA "${ua.substring(0, 40)}…", retrying with fallback UA`
      );
      await page.close();
    } else {
      // Last UA also got 4xx — return the page anyway so extractors can
      // run (they'll get limited data but won't crash)
      console.warn(
        `[scraper] HTTP ${status} for ${url} — all user agents returned 4xx`
      );
      return page;
    }
  }

  // Shouldn't be reached, but TypeScript needs a return
  const page = await setupPage(browser, USER_AGENTS[0]);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
  return page;
}
