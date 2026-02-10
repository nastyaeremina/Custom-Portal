"use client";

import { cn } from "@/lib/utils/cn";

/**
 * Footer — matches assembly.com footer layout.
 *
 * Structure:
 *   Brand column (logo, tagline, social) + 6 link columns in a 3×2 grid
 */

/* ─── Link column data (6 columns, arranged in 3-col rows) ─── */

const linkColumns = [
  {
    title: "Features",
    links: [
      "Client Portal",
      "Messages",
      "Invoicing",
      "Contracts",
      "Tasks",
      "Files",
      "Forms",
      "Stores",
    ],
  },
  {
    title: "Platform",
    links: [
      "Developer Home",
      "Custom Apps",
      "API Reference",
      "Assembly on Zapier",
      "Assembly on Make",
    ],
  },
  {
    title: "Company",
    links: ["Jobs", "Brand", "Pricing", "Terms of Service", "Privacy Policy"],
  },
  {
    title: "Solutions",
    links: [
      "Accounting and Bookkeeping",
      "Marketing Agencies",
      "Startups",
      "Consulting Firms",
      "Real Estate",
      "Freelancers",
      "Law Firms",
    ],
  },
  {
    title: "Compare",
    links: [
      "Compare All",
      "vs Moxo",
      "vs Suitedash",
      "vs HoneyBook",
      "vs SmartVault",
    ],
  },
  {
    title: "Contract Templates",
    links: [
      "Marketing Contract Templates",
      "Accounting Contract Templates",
      "Social Media Contract Templates",
      "Client Onboarding Templates",
    ],
  },
];

const socialIcons = [
  { name: "twitter", label: "X / Twitter" },
  { name: "linkedin", label: "LinkedIn" },
  { name: "instagram", label: "Instagram" },
  { name: "youtube", label: "YouTube" },
  { name: "facebook", label: "Facebook" },
];

export function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "w-full border-t",
        "px-[var(--space-40)] py-[var(--space-64)]",
        className
      )}
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="max-w-[1360px] mx-auto">
        {/* ─── Top section: Brand + Link columns ─── */}
        <div className="flex flex-col md:flex-row gap-[var(--space-64)]">
          {/* Brand Column */}
          <div className="flex flex-col gap-[var(--space-24)] md:min-w-[200px] md:max-w-[240px]">
            {/* Logo */}
            <img
              src="/assets/icons/Logo.svg"
              alt="Assembly"
              height={38}
              className="h-[38px] w-auto self-start"
            />
            <p
              className="text-[var(--font-size-caption)]"
              style={{
                color: "var(--text-secondary)",
                lineHeight: "var(--line-height-caption)",
              }}
            >
              Create remarkable
              <br />
              client experiences.
            </p>

            {/* Social Icons */}
            <div className="flex items-center gap-[var(--space-24)]">
              {socialIcons.map((icon) => (
                <a
                  key={icon.name}
                  href="#"
                  aria-label={icon.label}
                  className="opacity-80 hover:opacity-100 transition-opacity"
                >
                  <img
                    src={`/assets/icons/${icon.name}.svg`}
                    alt={icon.label}
                    width={24}
                    height={24}
                    className="w-6 h-6"
                  />
                </a>
              ))}
            </div>
          </div>

          {/* Link Columns — 3 columns per row, 2 rows = 6 columns total */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-x-[var(--space-40)] gap-y-[var(--space-48)]">
            {linkColumns.map((col) => (
              <div key={col.title} className="flex flex-col gap-[var(--space-16)]">
                <h3
                  className="text-[var(--font-size-caption)] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {col.title}
                </h3>
                <ul className="flex flex-col gap-[var(--space-12)]">
                  {col.links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="text-[var(--font-size-caption)] transition-colors hover:opacity-70"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

      </div>
    </footer>
  );
}
