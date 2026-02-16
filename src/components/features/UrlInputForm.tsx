"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { validateInput } from "@/lib/utils/url";

interface UrlInputFormProps {
  onSubmit: (input: string) => void;
  isLoading: boolean;
  hasResult: boolean;
  /** API / server error surfaced by the parent — shown in the same style as validation errors. */
  apiError?: string | null;
  /** Called when the user edits the input so the parent can clear its error state. */
  onClearError?: () => void;
}

/**
 * Search bar — matches Figma "Search" component.
 *
 * Pill-shaped container (radius: 48px, border: 1px) with an
 * embedded dark "Generate" button on the right side.
 * Max-width: 571px (fluid on mobile), min-height: 52px.
 * Padding: 6px top/bottom, 8px right (snug button), 16px left (text).
 */
export function UrlInputForm({
  onSubmit,
  isLoading,
  hasResult,
  apiError,
  onClearError,
}: UrlInputFormProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  /* Merge: local validation error takes priority; otherwise show API error */
  const displayError = error || apiError || "";

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
    <div className="flex flex-col items-center gap-2 w-full max-w-[571px]">
      <form
        onSubmit={handleSubmit}
        className={cn(
          "flex items-center w-full",
          "rounded-[48px] border transition-colors",
          displayError ? "border-[#FF5644]" : "border-[var(--border-hover)]",
          "focus-within:border-[var(--gray-450)]"
        )}
        style={{
          minHeight: "52px",
          backgroundColor: "var(--background)",
          padding: "6px 8px 6px 24px",
          gap: "16px",
        }}
      >
        {/* Input field */}
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError("");
            onClearError?.();
          }}
          placeholder="Enter email or website"
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
      {displayError && (
        <p className="text-sm flex items-center gap-1.5 w-full pl-[24px]" style={{ color: "#FF5644" }}>
          <svg
            width={12}
            height={12}
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
          >
            <path
              d="M2.14247 1.75724C1.93032 1.75724 1.75675 1.93081 1.75675 2.14295V9.85724C1.75675 10.0694 1.93032 10.243 2.14247 10.243H9.85675C10.0689 10.243 10.2425 10.0694 10.2425 9.85724V2.14295C10.2425 1.93081 10.0689 1.75724 9.85675 1.75724H2.14247ZM0.599609 2.14295C0.599609 1.29197 1.29148 0.600098 2.14247 0.600098H9.85675C10.7077 0.600098 11.3996 1.29197 11.3996 2.14295V9.85724C11.3996 10.7082 10.7077 11.4001 9.85675 11.4001H2.14247C1.29148 11.4001 0.599609 10.7082 0.599609 9.85724V2.14295ZM4.04693 4.04742C4.27354 3.82081 4.63997 3.82081 4.86416 4.04742L5.9972 5.18045L7.13023 4.04742C7.35684 3.82081 7.72327 3.82081 7.94747 4.04742C8.17166 4.27403 8.17407 4.64045 7.94747 4.86465L6.81443 5.99769L7.94747 7.13072C8.17407 7.35733 8.17407 7.72376 7.94747 7.94795C7.72086 8.17215 7.35443 8.17456 7.13023 7.94795L5.9972 6.81492L4.86416 7.94795C4.63756 8.17456 4.27113 8.17456 4.04693 7.94795C3.82273 7.72135 3.82032 7.35492 4.04693 7.13072L5.17997 5.99769L4.04693 4.86465C3.82032 4.63804 3.82032 4.27162 4.04693 4.04742Z"
              fill="#FF5644"
            />
          </svg>
          {displayError}
        </p>
      )}
    </div>
  );
}
