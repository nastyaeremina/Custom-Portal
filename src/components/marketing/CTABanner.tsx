"use client";

import { cn } from "@/lib/utils/cn";

/**
 * CTA Banner — matches Figma "CTA" section.
 *
 * Background: CTA.png image on #101618 base.
 * Border-radius: 16px (--radius-lg).
 * Padding: 64px all sides.
 * Inner gap: 24px between heading / subtitle / button.
 */
export function CTABanner({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        "relative overflow-hidden",
        "flex flex-col items-center justify-center",
        "p-6 sm:p-10 md:p-[var(--space-64)]",
        "rounded-[var(--radius-lg)]",
        "text-center",
        className
      )}
      style={{
        backgroundColor: "#101618",
        backgroundImage: "url(/assets/Images/CTA.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="relative z-10 flex flex-col items-center gap-[var(--space-24)]">
        <h2
          className="font-normal"
          style={{
            fontSize: "clamp(24px, 5vw, var(--font-size-h2))",
            lineHeight: "var(--line-height-h2)",
            color: "var(--offwhite-100)",
          }}
        >
          Finish setting up this portal
        </h2>
        <p
          className="text-[var(--font-size-body)]"
          style={{
            lineHeight: "var(--line-height-body)",
            color: "var(--offwhite-100)",
          }}
        >
          Try Assembly free for 14 days, no credit card required.
        </p>
        <a
          href="https://dashboard.assembly.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="px-[var(--space-32)] py-[var(--space-12)] text-[var(--font-size-button)] font-semibold rounded-[var(--radius-full)] transition-all hover:opacity-90 inline-block"
          style={{
            backgroundColor: "var(--base-white)",
            color: "var(--text-primary)",
          }}
        >
          Complete setup
        </a>
      </div>
    </section>
  );
}
