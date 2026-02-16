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

/** Set up a fresh page with request interception and the given user agent. */
async function setupPage(browser: Browser, ua: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(ua);

  // Block unnecessary resources to speed up loading
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();
    if (["media", "font", "websocket"].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  return page;
}

export async function createPage(browser: Browser, url: string): Promise<Page> {
  // Try each user agent; retry on 4xx (typically 403 from WAFs)
  for (let i = 0; i < USER_AGENTS.length; i++) {
    const ua = USER_AGENTS[i];
    const page = await setupPage(browser, ua);

    const response = await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    const status = response?.status() ?? 0;

    // Usable response (2xx/3xx or server errors that won't change with a different UA)
    if (status === 0 || status < 400 || status >= 500) {
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
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  return page;
}
