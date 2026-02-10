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
        "px-[var(--space-40)] py-[var(--space-20)]",
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
      <img
        src="/assets/icons/Logo.svg"
        alt="Assembly"
        height={32}
        className="h-[32px] w-auto"
      />

      {/* Nav Links */}
      <div className="hidden md:flex items-center gap-[var(--space-40)]">
        {["Products", "Solutions", "Resources", "Customers", "Pricing"].map(
          (item) => (
            <a
              key={item}
              href="#"
              className="text-[var(--font-size-button)] font-semibold transition-colors hover:opacity-70"
              style={{ color: "var(--text-primary)" }}
            >
              {item}
            </a>
          )
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-[var(--space-24)]">
        <a
          href="#"
          className="hidden md:inline-block text-[var(--font-size-button)] font-normal"
          style={{ color: "var(--text-primary)" }}
        >
          Book demo
        </a>
        <a
          href="#"
          className="hidden md:inline-block text-[var(--font-size-button)] font-normal"
          style={{ color: "var(--text-primary)" }}
        >
          Log in
        </a>
        <button
          className="px-[var(--space-24)] py-[var(--space-12)] text-[var(--font-size-button)] font-medium text-white rounded-[var(--radius-full)] transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--base-off-black)" }}
        >
          Start Trial
        </button>
      </div>
    </nav>
  );
}
