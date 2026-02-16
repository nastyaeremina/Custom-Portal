"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Marketing Navbar — matches Figma "Navbar" component.
 *
 * Layout: Fixed 1440px, H: 80px, padding 20px vertical.
 * Background: offwhite-300 with backdrop blur.
 * Contains: Logo + nav links + CTA buttons.
 *
 * Border: A 1px bottom border appears only after the user scrolls,
 * matching assembly.com behaviour.
 */
export function Navbar({ className }: { className?: string }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 0);
    handleScroll(); // check on mount in case page loads scrolled
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        "w-full sticky top-0 z-50",
        "flex items-center justify-between",
        "px-4 md:px-[var(--space-40)] py-[var(--space-20)]",
        "backdrop-blur-[20px]",
        "transition-[border-color] duration-200",
        className
      )}
      style={{
        backgroundColor: "var(--offwhite-100)",
        borderBottom: scrolled
          ? "1px solid var(--border-default)"
          : "1px solid transparent",
      }}
    >
      {/* Logo — Assembly full wordmark, sized to match assembly.com (174×32) */}
      <a href="https://assembly.com" target="_blank" rel="noopener noreferrer">
        <img
          src="/assets/icons/Logo.svg"
          alt="Assembly"
          height={32}
          className="h-[32px] w-auto"
        />
      </a>

      {/* Right Actions */}
      <div className="flex items-center gap-[var(--space-24)]">
        <a
          href="https://assembly.com/book-demo"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:inline-block text-[var(--font-size-button)] font-normal"
          style={{ color: "var(--text-primary)" }}
        >
          Book demo
        </a>
        <a
          href="https://dashboard.assembly.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:inline-block text-[var(--font-size-button)] font-normal"
          style={{ color: "var(--text-primary)" }}
        >
          Log in
        </a>
        <a
          href="https://assembly.com/signup"
          target="_blank"
          rel="noopener noreferrer"
          className="px-[var(--space-24)] py-[var(--space-12)] text-[var(--font-size-button)] font-medium text-white rounded-[var(--radius-full)] transition-colors hover:opacity-90 inline-block"
          style={{ backgroundColor: "var(--base-off-black)" }}
        >
          Start Trial
        </a>
      </div>
    </nav>
  );
}
