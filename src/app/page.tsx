"use client";

import { useState, useCallback, useMemo } from "react";
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
  squareIconBg: null,
  fullLogoUrl: null,
};

const STATIC_THEME: PreviewTheme = {
  sidebarBackground: "#101618",
  sidebarText: "#ffffff",
  accent: "#3b82f6",
};

const STATIC_HERO_IMAGE = "/assets/Images/Rectangle 34624749.png";

/* Card dimensions matching PortalPreview carousel cards */
const STATIC_CARD_W = 660;
const STATIC_CARD_H = 525;
/* LoginView native inner size (from CARD_CONFIGS.login) */
const LOGIN_INNER_W = 626;
const LOGIN_INNER_H = 465;
const LOGIN_PAD_TOP = 31;
const LOGIN_PAD_LEFT = 34;

interface StreamEvent {
  type: "scraping" | "colors" | "images" | "dalle" | "dalle_progress" | "complete" | "error";
  data?: Partial<PortalData>;
  rawOutputs?: Partial<RawOutputs>;
  message?: string;
  error?: string;
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [rawOutputs, setRawOutputs] = useState<RawOutputs | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
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
                    fullLogo: event.data?.images?.fullLogo ?? prev?.images?.fullLogo ?? null,
                    loginImage: event.data?.images?.loginImage ?? prev?.images?.loginImage ?? null,
                    dashboardImage: event.data?.images?.dashboardImage ?? prev?.images?.dashboardImage ?? null,
                    socialImage: event.data?.images?.socialImage ?? prev?.images?.socialImage ?? null,
                    rawFaviconUrl: event.data?.images?.rawFaviconUrl ?? prev?.images?.rawFaviconUrl ?? null,
                    rawLogoUrl: event.data?.images?.rawLogoUrl ?? prev?.images?.rawLogoUrl ?? null,
                  },
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
                }));
              }

              if (event.type === "complete") {
                setStatusMessage(null);
              }
            } catch (parseError) {
              console.error("Failed to parse SSE event:", parseError);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
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
        className="flex flex-col items-center"
        style={{ padding: "var(--space-48) var(--space-40)", gap: "var(--space-48)" }}
      >
        {/* Hero content: heading + subtitle + search */}
        <div
          className="flex flex-col items-center text-center"
          style={{ gap: "var(--space-40)", maxWidth: "832px" }}
        >
          {/* Text group */}
          <div className="flex flex-col items-center" style={{ gap: "var(--space-24)" }}>
            <h1
              className="font-semibold"
              style={{
                fontSize: "var(--font-size-h1)",
                lineHeight: "var(--line-height-h1)",
                color: "var(--text-primary)",
                maxWidth: "832px",
              }}
            >
              Create a customized
              <br />
              white-labeled client portal
            </h1>
            <p
              style={{
                fontSize: "var(--font-size-body)",
                lineHeight: "var(--line-height-body)",
                color: "var(--text-secondary)",
                maxWidth: "550px",
              }}
            >
              Enter your work email or company website to
              <br />
              preview your branded client portal.
            </p>
          </div>

          {/* Search bar */}
          <UrlInputForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            hasResult={!!portalData}
          />
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div
            className="flex items-center justify-center gap-2"
            style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-caption)" }}
          >
            <div
              className="w-4 h-4 border-2 rounded-full animate-spin"
              style={{ borderColor: "var(--border-default)", borderTopColor: "var(--text-secondary)" }}
            />
            {statusMessage}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div
            className="max-w-lg w-full p-4 rounded-[var(--radius-md)] text-sm"
            style={{
              backgroundColor: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#dc2626",
            }}
          >
            {error}
          </div>
        )}

        {/* Static hero card — shown before any generation */}
        {!isLoading && !previewPayload && (
          <div
            className="overflow-hidden select-none pointer-events-none"
            style={{
              width: `${STATIC_CARD_W}px`,
              height: `${STATIC_CARD_H}px`,
              backgroundColor: "#F2F2E8",
              borderRadius: "9px",
              border: "1px solid #ECECE0",
            }}
          >
            <div
              style={{
                width: `${LOGIN_INNER_W}px`,
                height: `${LOGIN_INNER_H}px`,
                transform: `translate(${LOGIN_PAD_LEFT}px, ${LOGIN_PAD_TOP}px)`,
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
              isLoading={isLoading && !previewPayload}
            />
          </div>
        )}
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="px-[var(--space-40)] pb-[var(--space-64)]">
        <div className="max-w-[1360px] mx-auto">
          <CTABanner />
        </div>
      </section>

      {/* ─── Footer ─── */}
      <Footer />
    </div>
  );
}
