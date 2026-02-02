"use client";

import { useState, useCallback } from "react";
import { UrlInputForm } from "@/components/features/UrlInputForm";
import { PortalPreview } from "@/components/portal/PortalPreview";
import { PortalData, RawOutputs } from "@/types/api";

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
                    fullLogo: event.data?.images?.fullLogo ?? prev?.images?.fullLogo ?? null,
                    loginImage: event.data?.images?.loginImage ?? prev?.images?.loginImage ?? null,
                    socialImage: event.data?.images?.socialImage ?? prev?.images?.socialImage ?? null,
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
    <main className="min-h-screen py-16 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-neutral-900 mb-4 tracking-tight">
            Create a customized
            <br />
            white-labeled client portal
          </h1>
          <p className="text-neutral-500">
            Enter your work email or company website to
            <br />
            preview your branded client portal.
          </p>
        </div>

        {/* Input Form */}
        <div className="mb-10">
          <UrlInputForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            hasResult={!!portalData}
          />
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="mb-4 flex items-center justify-center gap-2 text-sm text-neutral-500">
            <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
            {statusMessage}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Portal Preview */}
        {(isLoading || portalData) && (
          <div className="mb-10">
            <PortalPreview
              data={portalData}
              rawOutputs={rawOutputs}
              isLoading={isLoading && !portalData}
            />
          </div>
        )}
      </div>
    </main>
  );
}
