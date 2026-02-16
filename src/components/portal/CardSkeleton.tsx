"use client";

/**
 * Subtle shimmer overlay for loading cards.
 * A semi-transparent white gradient sweeps across the beige card background.
 */
export function CardSkeleton() {
  return (
    <div className="w-full h-full overflow-hidden relative">
      <div className="shimmer absolute inset-0" />
    </div>
  );
}
