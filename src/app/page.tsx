"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { UrlInputForm } from "@/components/features/UrlInputForm";
import { PortalPreview } from "@/components/portal/PortalPreview";
import { LoginView } from "@/components/portal/LoginView";
import { Navbar } from "@/components/marketing/Navbar";
import { CTABanner } from "@/components/marketing/CTABanner";
import { Footer } from "@/components/marketing/Footer";
import { PortalData, RawOutputs } from "@/types/api";
import type { PreviewBranding, PreviewTheme } from "@/types/preview";
import { toPreviewPayload } from "@/types/preview";

/* ─── Static hero card defaults ─── */
const STATIC_BRANDING: PreviewBranding = {
  companyName: "Assembly",
  logoUrl: "/assets/icons/Brandmages logo (small inverse).svg",
  squareIconBg: "#1E293B",
  logoDominantColor: null,
  squareIconFg: null,
  fullLogoUrl: null,
};

const STATIC_THEME: PreviewTheme = {
  sidebarBackground: "#101618",
  sidebarText: "#ffffff",
  accent: "#3b82f6",
};

const STATIC_HERO_IMAGE = "/assets/Images/new.png";

/* LoginView native inner size (from CARD_CONFIGS.login) */
const LOGIN_INNER_W = 626;
const LOGIN_INNER_H = 465;
const LOGIN_PAD_TOP = 31;
const LOGIN_PAD_LEFT = 34;
/* The total "design" size — only left+top padding so content bleeds to right/bottom edges */
const LOGIN_DESIGN_W = LOGIN_INNER_W + LOGIN_PAD_LEFT; // 660px
const LOGIN_DESIGN_H = LOGIN_INNER_H + LOGIN_PAD_TOP; // 496px
/* Maximum card dimensions on desktop */
/* Max width derived from max height to ensure content fills edge-to-edge */
const STATIC_CARD_MAX_H = 590;
const STATIC_CARD_MAX_W = (STATIC_CARD_MAX_H / LOGIN_DESIGN_H) * LOGIN_DESIGN_W; // ~785px


interface StreamEvent {
  type: "scraping" | "colors" | "images" | "dalle" | "dalle_progress" | "complete" | "error";
  data?: Partial<PortalData>;
  rawOutputs?: Partial<RawOutputs>;
  message?: string;
  error?: string;
}

/** Convert raw technical error messages into user-friendly text. */
function humanizeError(raw: string): string {
  // DNS / domain not found
  if (raw.includes("ERR_NAME_NOT_RESOLVED"))
    return "We couldn't find that website. Please check the URL and try again.";
  // Connection refused
  if (raw.includes("ERR_CONNECTION_REFUSED"))
    return "This website refused the connection. It may be down or blocking automated access.";
  // SSL / certificate errors
  if (raw.includes("ERR_CERT"))
    return "This website has a security certificate issue. We couldn't connect safely.";
  // Timeout (Puppeteer navigation or networkidle)
  if (/timeout/i.test(raw))
    return "This website took too long to respond. Please try again.";
  // Network down
  if (raw.includes("ERR_INTERNET_DISCONNECTED") || raw.includes("ERR_NETWORK"))
    return "It looks like you're offline. Please check your connection and try again.";
  // HTTP 4xx / 5xx from our own API
  if (/^HTTP error: [45]\d\d$/.test(raw))
    return "Something went wrong on our end. Please try again.";
  // Empty response body (edge case)
  if (raw === "No response body")
    return "We couldn't get a response. Please try again.";
  // Generic unknown
  if (raw === "Unknown error occurred" || raw === "Unknown error")
    return "Something went wrong. Please try again.";
  // Catch-all fallback
  return "Something went wrong while generating your preview. Please try again.";
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [rawOutputs, setRawOutputs] = useState<RawOutputs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputDirty, setInputDirty] = useState(false);

  /* ─── Fluid scaling for desktop static hero card ─── */
  const [containerW, setContainerW] = useState(STATIC_CARD_MAX_W);

  // Callback ref: re-attaches the ResizeObserver every time the static card
  // mounts (including after an error remount), and cleans up when it unmounts.
  const roRef = useRef<ResizeObserver | null>(null);
  const desktopCardRef = useCallback((node: HTMLDivElement | null) => {
    // Disconnect previous observer
    if (roRef.current) {
      roRef.current.disconnect();
      roRef.current = null;
    }
    if (!node) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        setContainerW(w);
      }
    });
    ro.observe(node);
    roRef.current = ro;
  }, []);

  /* Scale based on width, but cap so height never exceeds STATIC_CARD_MAX_H */
  const scaleFromW = containerW / LOGIN_DESIGN_W;
  const scaleFromH = STATIC_CARD_MAX_H / LOGIN_DESIGN_H;
  const fluidScale = Math.min(scaleFromW, scaleFromH);

  /* Height follows the capped scale */
  const fluidCardH = LOGIN_DESIGN_H * fluidScale;

  /** Transform pipeline output → preview payload (memoized) */
  const previewPayload = useMemo(
    () => (portalData ? toPreviewPayload(portalData, rawOutputs) : null),
    [portalData, rawOutputs]
  );

  const handleSubmit = useCallback(async (input: string) => {
    setIsLoading(true);
    setError(null);
    setPortalData(null);
    setRawOutputs(null);
    setInputDirty(false);
    setStatusMessage("Starting...");

    try {
      const response = await fetch("/api/generate-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (!done) {
          buffer += decoder.decode(value, { stream: true });
        } else {
          // Flush the TextDecoder's internal state
          buffer += decoder.decode();
        }
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: StreamEvent = JSON.parse(line.slice(6));

              if (event.message) {
                setStatusMessage(event.message);
              }

              if (event.type === "error") {
                throw new Error(event.error || "Unknown error");
              }

              if (event.data) {
                setPortalData(prev => ({
                  companyName: event.data?.companyName ?? prev?.companyName ?? "",
                  colors: event.data?.colors ?? prev?.colors ?? {
                    sidebarBackground: "#1a1a1a",
                    sidebarText: "#ffffff",
                    accent: "#3b82f6",
                  },
                  images: {
                    squareIcon: event.data?.images?.squareIcon ?? prev?.images?.squareIcon ?? null,
                    squareIconBg: event.data?.images?.squareIconBg ?? prev?.images?.squareIconBg ?? null,
                    logoDominantColor: event.data?.images?.logoDominantColor ?? prev?.images?.logoDominantColor ?? null,
                    squareIconFg: event.data?.images?.squareIconFg ?? prev?.images?.squareIconFg ?? null,
                    fullLogo: event.data?.images?.fullLogo ?? prev?.images?.fullLogo ?? null,
                    loginImage: event.data?.images?.loginImage ?? prev?.images?.loginImage ?? null,
                    loginImageOrientation: event.data?.images?.loginImageOrientation ?? prev?.images?.loginImageOrientation ?? null,
                    loginImageType: event.data?.images?.loginImageType ?? prev?.images?.loginImageType ?? null,
                    loginImageEdgeColor: event.data?.images?.loginImageEdgeColor ?? prev?.images?.loginImageEdgeColor ?? null,
                    loginGradientImage: event.data?.images?.loginGradientImage ?? prev?.images?.loginGradientImage ?? null,
                    dashboardImage: event.data?.images?.dashboardImage ?? prev?.images?.dashboardImage ?? null,
                    socialImage: event.data?.images?.socialImage ?? prev?.images?.socialImage ?? null,
                    rawFaviconUrl: event.data?.images?.rawFaviconUrl ?? prev?.images?.rawFaviconUrl ?? null,
                    rawLogoUrl: event.data?.images?.rawLogoUrl ?? prev?.images?.rawLogoUrl ?? null,
                  },
                  welcomeMessage: event.data?.welcomeMessage ?? prev?.welcomeMessage ?? "",
                }));
              }

              if (event.rawOutputs) {
                setRawOutputs(prev => ({
                  scrapedColors: event.rawOutputs?.scrapedColors ?? prev?.scrapedColors ?? [],
                  scrapedImages: event.rawOutputs?.scrapedImages ?? prev?.scrapedImages ?? [],
                  extractedMeta: event.rawOutputs?.extractedMeta ?? prev?.extractedMeta ?? {},
                  colorThiefPalette: event.rawOutputs?.colorThiefPalette ?? prev?.colorThiefPalette ?? [],
                  generatedWithDalle: event.rawOutputs?.generatedWithDalle ?? prev?.generatedWithDalle ?? false,
                  faviconUrl: event.rawOutputs?.faviconUrl ?? prev?.faviconUrl ?? null,
                  logoUrl: event.rawOutputs?.logoUrl ?? prev?.logoUrl ?? null,
                  dalleImageUrl: event.rawOutputs?.dalleImageUrl ?? prev?.dalleImageUrl ?? null,
                  dalleGenerations: event.rawOutputs?.dalleGenerations ?? prev?.dalleGenerations,
                  accentColorSource: event.rawOutputs?.accentColorSource ?? prev?.accentColorSource,
                  accentColorConfidence: event.rawOutputs?.accentColorConfidence ?? prev?.accentColorConfidence,
                  navHeaderBackground: event.rawOutputs?.navHeaderBackground ?? prev?.navHeaderBackground,
                  sidebarColorSource: event.rawOutputs?.sidebarColorSource ?? prev?.sidebarColorSource,
                  qualityGateResult: event.rawOutputs?.qualityGateResult ?? prev?.qualityGateResult,
                  accentPromotion: event.rawOutputs?.accentPromotion ?? prev?.accentPromotion,
                  disciplineDetection: event.rawOutputs?.disciplineDetection ?? prev?.disciplineDetection,
                  gradientDebug: event.rawOutputs?.gradientDebug ?? prev?.gradientDebug,
                  diversityScore: event.rawOutputs?.diversityScore ?? prev?.diversityScore,
                }));
              }

              if (event.type === "complete") {
                setStatusMessage(null);
              }
            } catch (parseError) {
              // Re-throw API errors so they reach the outer catch → setError()
              if (parseError instanceof Error && !parseError.message.includes("JSON")) {
                throw parseError;
              }
              console.error("Failed to parse SSE event:", parseError);
            }
          }
        }

        if (done) break;
      }
    } catch (err) {
      setError(humanizeError(err instanceof Error ? err.message : ""));
      setPortalData(null);
      setRawOutputs(null);
    } finally {
      setIsLoading(false);
      setStatusMessage(null);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--offwhite-100)" }}>
      {/* ─── Navbar ─── */}
      <Navbar />

      {/* ─── Hero Section ─── */}
      <section
        className="flex flex-col items-center px-4 md:px-[var(--space-40)] pt-8 md:pt-[var(--space-48)] pb-8 md:pb-[var(--space-48)] gap-8 md:gap-[var(--space-48)]"
      >
        {/* Hero content: heading + subtitle + search */}
        <div
          className="flex flex-col items-center text-center w-full max-w-[832px]"
          style={{ gap: "var(--space-40)" }}
        >
          {/* Text group */}
          <div className="flex flex-col items-center" style={{ gap: "var(--space-24)" }}>
            <h1
              className="font-semibold text-[clamp(2rem,5vw,var(--font-size-h1))]"
              style={{
                lineHeight: 1.1,
                color: "var(--text-primary)",
              }}
            >
              Create a customized{" "}
              white&#8209;labeled client portal
            </h1>
            <p
              className="max-w-[550px]"
              style={{
                fontSize: "var(--font-size-body)",
                lineHeight: "var(--line-height-body)",
                color: "var(--text-secondary)",
              }}
            >
              Enter your work email or company website to preview your branded client portal.
            </p>
          </div>

          {/* Search bar */}
          <UrlInputForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            hasResult={!!portalData && !inputDirty}
            apiError={error}
            onClearError={() => setError(null)}
            onInputDirty={() => setInputDirty(true)}
          />
        </div>

        {/* Static hero card — shown before any generation, fluid across all breakpoints */}
        {!isLoading && !previewPayload && (
          <div
            ref={desktopCardRef}
            className="overflow-hidden select-none pointer-events-none w-full"
            style={{
              maxWidth: `${STATIC_CARD_MAX_W}px`,
              height: `${fluidCardH}px`,
              backgroundColor: "#F2F2E8",
              borderRadius: "8px",
              border: "1px solid #ECECE0",
            }}
          >
            <div
              style={{
                width: `${LOGIN_INNER_W}px`,
                height: `${LOGIN_INNER_H}px`,
                transform: `translate(${LOGIN_PAD_LEFT * fluidScale}px, ${LOGIN_PAD_TOP * fluidScale}px) scale(${fluidScale})`,
                transformOrigin: "top left",
              }}
            >
              <LoginView
                branding={STATIC_BRANDING}
                theme={STATIC_THEME}
                loginHeroImageUrl={STATIC_HERO_IMAGE}
              />
            </div>
          </div>
        )}

        {/* Portal Preview — shown after generation */}
        {(isLoading || previewPayload) && (
          <div className="w-full max-w-[1200px]">
            <PortalPreview
              payload={previewPayload}
              isLoading={isLoading}
            />
          </div>
        )}
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="px-4 md:px-[var(--space-40)] pb-[var(--space-64)]">
        <div className="max-w-[1360px] mx-auto">
          <CTABanner />
        </div>
      </section>

      {/* ─── Footer ─── */}
      <Footer />
    </div>
  );
}
