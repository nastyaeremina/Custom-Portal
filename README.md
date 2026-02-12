# Custom Portal Preview

AI-powered tool that scrapes any website and generates a branded client portal preview — complete with extracted colors, logos, hero images, and gradient backgrounds.

Enter a URL, get a live preview of Login, Dashboard, and Marketing pages styled to match that brand.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

---

## How It Works

### 1. Scraping & Color Extraction

The tool scrapes the target website using Puppeteer, extracting:
- **Favicon & logo** (with transparent-background processing via Sharp)
- **Brand colors** — accent, sidebar background, nav header, text colors
- **OG image** and other social/meta images
- **Page metadata** — title, description

Colors go through a **quality gate** that validates contrast ratios, rejects near-white/near-black accents, and can promote a better accent color from the scraped palette.

### 2. Gradient Generation (No AI Needed)

Gradients are generated **deterministically** from scraped brand colors — no API keys required.

**How gradients are built:**
- Colors are extracted from the site's images and brand palette
- A **domain-seeded hash** (djb2) picks a deterministic angle and gradient mode
- Modes: `analogous` (hue-shifted), `complementary` (opposite hues), `triadic`, or `preset` (curated palettes)
- The gradient is rendered as an SVG, converted to PNG

**Palette diversity scoring** (`palette-scorer.ts`) decides whether the gradient is visually interesting enough to use:
- Measures **hue spread**, **luminance range**, **mean saturation**, and **stop count**
- Score > 0.45 = gradient is diverse enough for hero images
- Score <= 0.45 = falls back to a library photo instead

### 3. Hero Image Decision Tree

Each portal preview has two hero images (Login screen + Dashboard). They're chosen independently:

```
                    +-- discipline match? --+
                    |                       |
                 YES |                       | NO
                    v                       v
          Login = discipline         +-- diverse palette? --+
          photo                      |                       |
                                  YES |                       | NO
          +-- diverse? --+           v                       v
          |              |     Login = gradient         Login = generic
       YES |           NO |     Dashboard = generic      Dashboard = same
          v              v                               generic photo
   Dashboard =     Dashboard =
   gradient        generic photo
```

**Discipline detection** (`detector.ts`) matches the site against known industries (legal, medical, finance, etc.) and picks a relevant stock photo from the library.

**Generic fallback** (`hero-selector.ts`) uses domain hashing to deterministically pick from the `generic/` photo library — same domain always gets the same image.

### 4. Streaming Preview (SSE)

Results stream to the browser via **Server-Sent Events** so the UI builds up progressively:

1. **Colors & basic data** — brand colors, logo URLs, hero images (if already resolved)
2. **Logo processing** — favicon/logo with transparent backgrounds
3. **Social image** — scraped OG image
4. **Image generations** — gradient approaches (3D wave, mesh, standard gradient, OG-extended)
5. **Final result** — complete payload with all resolved images

### 5. Portal UI

The preview renders three screens:
- **Login** — sidebar with logo + hero image, sign-in form
- **Dashboard** — header, sidebar navigation, hero banner, content cards in a carousel
- **Marketing pages** — public-facing landing page mockup

**Carousel** uses `requestAnimationFrame` at 60fps with:
- Smoothstep ease-in autoplay
- Time-based exponential momentum decay on drag release
- Critically damped spring snap to nearest card
- `prefers-reduced-motion` support

---

## Getting Started

### Prerequisites

- Node.js 18+
- Chrome/Chromium (for Puppeteer scraping)

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and enter any website URL.

### Environment Variables (optional)

| Variable | Default | Description |
|---|---|---|
| `ALLOW_GENERIC_LIBRARY` | `false` | Enable generic photo library for hero images |

No API keys are required — all image generation is deterministic.

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   └── generate-stream/   # SSE streaming endpoint
│   └── page.tsx               # Main UI
├── components/
│   └── portal/
│       └── PortalPreview.tsx   # Login/Dashboard/Marketing preview + carousel
├── lib/
│   ├── discipline/
│   │   ├── detector.ts         # Industry/discipline classifier
│   │   ├── hero-selector.ts    # Hero image picker (discipline + generic)
│   │   └── index.ts
│   ├── images/
│   │   ├── dalle.ts            # Gradient generation (deterministic, no AI)
│   │   ├── palette-scorer.ts   # Diversity scoring for gradient vs photo
│   │   └── processor.ts        # Logo/favicon processing (Sharp)
│   └── scraper/
│       ├── browser.ts          # Puppeteer browser management
│       ├── extractors.ts       # Color, logo, metadata extraction
│       └── index.ts
├── types/
│   └── api.ts                  # Shared TypeScript interfaces
└── public/
    └── assets/
        └── login-hero/         # Hero image library
            ├── generic/        # Generic photos (Unsplash)
            ├── legal/          # Discipline-specific photos
            ├── medical/
            └── ...
```

---

## Deploy

Works on Vercel out of the box (uses `@sparticuz/chromium-min` for serverless Puppeteer).

```bash
npm run build
```
