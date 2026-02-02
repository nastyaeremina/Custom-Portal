"use client";

import { useState } from "react";
import { UrlInputForm } from "@/components/features/UrlInputForm";
import { PortalPreview } from "@/components/portal/PortalPreview";
import { PortalData, RawOutputs, GenerateResponse } from "@/types/api";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [portalData, setPortalData] = useState<PortalData | null>(null);
  const [rawOutputs, setRawOutputs] = useState<RawOutputs | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (input: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      });

      const data: GenerateResponse = await response.json();

      if (!data.success || !data.data) {
        throw new Error(data.error || "Failed to generate preview");
      }

      setPortalData(data.data);
      setRawOutputs(data.rawOutputs || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setPortalData(null);
      setRawOutputs(null);
    } finally {
      setIsLoading(false);
    }
  };

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
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
    </main>
  );
}
