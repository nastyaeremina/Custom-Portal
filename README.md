# Custom Portal Preview

AI-powered tool that scrapes any website and generates a branded client portal preview — complete with extracted colors, logos, hero images, and gradient backgrounds.

Enter a URL, get a live preview of Login, Dashboard, and Marketing pages styled to match that brand.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![React](https://img.shields.io/badge/React-19-blue) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

---

## How It Works

### 1. Scraping & Color Extraction

The tool scrapes the target website using Puppeteer, extracting:
- **Favicon & logo** — multi-strategy extraction handles Wix, Framer, Squarespace, and other platforms. Strategies include home-link logo detection at any DOM depth, SVG extraction, and full-URL home link matching
- **Brand colors** — accent (from favicon, logo, or link/button colors), sidebar background (from nav header or accent), text colors
- **Hero images** — all large images tagged by type (hero, logo, favicon, og) with dimensions
- **OG image** and other social/meta images
- **Company name** — scored from multiple candidates (meta tags, header text, OG title, domain) with legalese filtering and generic word penalties
- **Page metadata** — title, description, nav header background color

Colors go through a **quality gate** that validates contrast ratios, rejects near-white/near-black accents, and can promote a better accent color from the scraped palette.

**Logo display** handles edge cases like white logos on white backgrounds by detecting when both `squareIconBg` and `logoDominantColor` are light, then using the sidebar brand color as a contrast fill.

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

### 3. Hero Image Pipeline

Login hero images are chosen through a multi-stage fallback pipeline:

```
1. OG image         → evaluateOgHero()          → if quality passes → use website OG
2. Scraped heroes   → evaluateScrapedHeroes()    → if quality passes → use website hero
3. Discipline lib   → selectHeroImage()          → if match found   → use discipline photo
4. Gradient fallback                                                 → generated gradient
```

**OG & scraped hero evaluation** (`og-hero-scorer.ts`) runs a quality gate with 6 weighted sub-scores:
- Resolution, aspect ratio, pixel area (size gates)
- Color complexity, edge density, spatial spread (content gates — reject logos, flat fills, text banners)
- Hard gates reject portraits, low-resolution, and low-complexity images
- Scraped heroes filter out `data:` URI placeholders and deduplicate before trying top 3 candidates by area

**Discipline detection** (`detector.ts`) matches the site against known industries (legal, medical, finance, etc.) and picks a relevant stock photo from the library.

**Generic fallback** (`hero-selector.ts`) uses domain hashing to deterministically pick from the `generic/` photo library — same domain always gets the same image.

Dashboard hero images are chosen independently via palette diversity scoring.

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
│   │   ├── generate/              # Non-streaming endpoint
│   │   └── generate-stream/       # SSE streaming endpoint
│   └── page.tsx                   # Main UI
├── components/
│   ├── portal/
│   │   ├── PortalPreview.tsx      # Login/Dashboard/Marketing preview + carousel
│   │   ├── CompanyLogo.tsx        # Logo display with white-logo contrast handling
│   │   ├── LoginView.tsx          # Login screen with hero image
│   │   ├── MessagesView.tsx       # Messages/chat screen
│   │   └── Sidebar.tsx            # Branded sidebar navigation
│   └── features/
│       └── UrlInputForm.tsx       # URL input with validation
├── lib/
│   ├── discipline/
│   │   ├── detector.ts            # Industry/discipline classifier
│   │   ├── hero-selector.ts       # Hero image picker (discipline + generic)
│   │   └── index.ts
│   ├── images/
│   │   ├── dalle.ts               # Gradient generation (deterministic, no AI)
│   │   ├── og-hero-scorer.ts      # OG & scraped hero quality gate (6-score system)
│   │   ├── brand-mark-selector.ts # Brand mark/icon scoring & selection
│   │   ├── palette-scorer.ts      # Diversity scoring for gradient vs photo
│   │   └── processor.ts           # Logo/favicon/hero processing (Sharp)
│   ├── scraper/
│   │   ├── browser.ts             # Puppeteer browser management + UA fallback
│   │   ├── extractors.ts          # Color, logo, hero, metadata extraction
│   │   └── index.ts
│   ├── utils/
│   │   └── company-name.ts        # Company name selection & scoring
│   └── welcome-message.ts         # Discipline-tailored welcome messages
├── types/
│   ├── api.ts                     # API request/response interfaces + RawOutputs
│   └── preview.ts                 # Portal preview branding/theme types
└── public/
    └── assets/
        └── login-hero/            # Hero image library
            ├── generic/           # Generic photos (Unsplash)
            ├── legal/             # Discipline-specific photos
            ├── medical/
            └── ...
```

---

## Deploy

Works on Vercel out of the box (uses `@sparticuz/chromium-min` for serverless Puppeteer).

```bash
npm run build
```
