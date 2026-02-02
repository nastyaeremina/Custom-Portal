import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.connected) {
    // Check if we're in a serverless environment (Vercel)
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

    if (isServerless) {
      // Use @sparticuz/chromium for serverless
      browserInstance = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1920, height: 1080 },
        executablePath: await chromium.executablePath(),
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

export async function createPage(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage();

  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });

  // Set user agent to avoid basic bot detection
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

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

  // Navigate with timeout
  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  return page;
}
