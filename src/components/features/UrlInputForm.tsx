"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { validateInput } from "@/lib/utils/url";

interface UrlInputFormProps {
  onSubmit: (input: string) => void;
  isLoading: boolean;
  hasResult: boolean;
}

/**
 * Search bar — matches Figma "Search" component.
 *
 * Pill-shaped container (radius: 48px, border: 1px) with an
 * embedded dark "Generate" button on the right side.
 * Width: 571px, Height: 52px.
 * Padding: 6px top/bottom, 8px right (snug button), 16px left (text).
 */
export function UrlInputForm({
  onSubmit,
  isLoading,
  hasResult,
}: UrlInputFormProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const result = validateInput(input);
    if (!result.valid) {
      setError(result.error ?? "Invalid input.");
      return;
    }

    setError("");
    onSubmit(input);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <form
        onSubmit={handleSubmit}
        className={cn(
          "flex items-center",
          "rounded-[48px] border transition-colors",
          error ? "border-[#FF5644]" : "border-[var(--border-hover)]",
          "focus-within:border-[var(--gray-450)]"
        )}
        style={{
          width: "571px",
          height: "52px",
          backgroundColor: "var(--offwhite-200)",
          padding: "6px 8px 6px 24px",
          gap: "16px",
          flexShrink: 0,
        }}
      >
        {/* Input field */}
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
          }}
          placeholder="Enter yourwebsite.com or you@company.com"
          disabled={isLoading}
          className={cn(
            "flex-1 min-w-0 bg-transparent outline-none",
            "text-[var(--font-size-body-sm)]",
            "placeholder:text-[var(--text-placeholder)]",
            "disabled:opacity-50"
          )}
          style={{
            color: "var(--text-primary)",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        />

        {/* Generate button — embedded in the pill */}
        <button
          type="submit"
          disabled={isLoading}
          className={cn(
            "flex items-center justify-center",
            "px-[var(--space-24)] py-[var(--space-8)]",
            "text-[var(--font-size-caption)] font-medium text-white",
            "rounded-[var(--radius-full)]",
            "transition-all hover:opacity-90",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "whitespace-nowrap shrink-0"
          )}
          style={{ backgroundColor: "var(--base-off-black)" }}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading...
            </div>
          ) : hasResult ? (
            "Generate again"
          ) : (
            "Generate"
          )}
        </button>
      </form>

      {/* Error message below the bar */}
      {error && (
        <p className="text-sm flex items-center gap-1.5 w-[571px] pl-[24px]" style={{ color: "#FF5644" }}>
          <img
            src="/assets/icons/Icon (approved) copy.svg"
            alt=""
            width={12}
            height={12}
            className="shrink-0"
          />
          {error}
        </p>
      )}
    </div>
  );
}
