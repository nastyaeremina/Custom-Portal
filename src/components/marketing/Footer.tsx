"use client";

import { cn } from "@/lib/utils/cn";

/**
 * Footer — matches assembly.com footer layout.
 *
 * Structure:
 *   Brand column (logo, tagline, social) + 9 link columns in a 3×3 grid
 */

/* ─── Link column data (9 columns, arranged in 3-col rows) ─── */

const linkColumns = [
  // ── Row 1 ──
  {
    title: "Features",
    links: [
      { label: "Client Portal", url: "https://assembly.com/client-portal" },
      { label: "Messages", url: "https://assembly.com/apps/directory/messaging-app" },
      { label: "Invoicing", url: "https://assembly.com/invoicing" },
      { label: "Contracts", url: "https://assembly.com/esignature" },
      { label: "Tasks", url: "https://assembly.com/apps/directory/tasks" },
      { label: "Files", url: "https://assembly.com/file-sharing" },
      { label: "Forms", url: "https://assembly.com/apps/directory/forms-app" },
      { label: "Stores", url: "https://assembly.com/store" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Accounting and Bookkeeping", url: "https://assembly.com/solutions/accounting-client-portal" },
      { label: "Marketing Agencies", url: "https://assembly.com/solutions/marketing-agency-client-portal" },
      { label: "Startups", url: "https://assembly.com/solutions/startups-client-portal" },
      { label: "Consulting Firms", url: "https://assembly.com/solutions/consulting-client-portal" },
      { label: "Real Estate", url: "https://assembly.com/solutions/real-estate-property-management-rental-management-client-portal" },
      { label: "Freelancers", url: "https://assembly.com/solutions/freelancer-client-portal" },
      { label: "Law Firms", url: "https://assembly.com/solutions/law-firm-client-portal-practice-management" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", url: "https://assembly.com/blog" },
      { label: "Guide", url: "https://assembly.com/guide" },
      { label: "What\u2019s New", url: "https://assembly.com/updates" },
      { label: "Find an expert", url: "https://assembly.com/experts" },
      { label: "Security", url: "https://security.assembly.com/" },
      { label: "System Status", url: "https://status.assembly.com/" },
      { label: "Affiliates Program", url: "https://assembly.com/affiliates-program" },
      { label: "LLM Info", url: "https://assembly.com/llm-info" },
    ],
  },
  // ── Row 2 ──
  {
    title: "Platform",
    links: [
      { label: "Developer Home", url: "https://docs.assembly.com/" },
      { label: "Custom Apps", url: "https://docs.assembly.com/docs/custom-apps-overview" },
      { label: "API Reference", url: "https://docs.assembly.com/reference/getting-started-introduction" },
      { label: "Assembly on Zapier", url: "https://zapier.com/apps/copilot/integrations" },
      { label: "Assembly on Make", url: "https://www.make.com/en/integrations/copilot" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "Compare All", url: "https://assembly.com/comparison" },
      { label: "vs Moxo", url: "https://assembly.com/comparison/assembly-vs-moxo-alternative" },
      { label: "vs Suitedash", url: "https://assembly.com/comparison/assembly-vs-suitedash-alternative" },
      { label: "vs HoneyBook", url: "https://assembly.com/comparison/assembly-vs-honeybook-alternative" },
      { label: "vs SmartVault", url: "https://assembly.com/comparison/assembly-vs-smartvault-alternative" },
    ],
  },
  {
    title: "Blog",
    links: [
      { label: "Copilot is now Assembly", url: "https://assembly.com/blog/copilot-rebrand-assembly" },
      { label: "Assembly Assistant is in Beta", url: "https://assembly.com/blog/assembly-assistant-beta" },
      { label: "How to Create a Customer Portal", url: "https://assembly.com/blog/how-to-create-a-customer-portal" },
      { label: "How to Bill a Client for the First Time", url: "https://assembly.com/blog/how-to-bill-a-client-for-the-first-time" },
      { label: "The Best Client Portal Software", url: "https://assembly.com/blog/best-client-portal-software" },
      { label: "Productized Services: How It Works", url: "https://assembly.com/blog/productized-service-business-model" },
    ],
  },
  // ── Row 3 ──
  {
    title: "Company",
    links: [
      { label: "Jobs", url: "https://assembly.com/jobs" },
      { label: "Brand", url: "https://assembly.com/brand" },
      { label: "Pricing", url: "https://assembly.com/pricing" },
      { label: "Terms", url: "https://assembly.com/legal/terms-of-service" },
      { label: "Privacy", url: "https://assembly.com/legal/privacy-policy" },
    ],
  },
  {
    title: "Contract Templates",
    links: [
      { label: "Marketing Contract Templates", url: "https://assembly.com/blog/marketing-contract-template" },
      { label: "Accounting Contract Templates", url: "https://assembly.com/blog/accounting-contract-template" },
      { label: "Social Media Contract Templates", url: "https://assembly.com/blog/social-media-contract-template" },
      { label: "Client Onboarding Templates", url: "https://assembly.com/blog/client-onboarding-questionnaire-template" },
    ],
  },
];

const socialIcons = [
  { name: "twitter", label: "X / Twitter", url: "https://x.com/assemblycom" },
  { name: "facebook", label: "Facebook", url: "https://www.facebook.com/assemblycom" },
  { name: "linkedin", label: "LinkedIn", url: "https://www.linkedin.com/company/assemblycom" },
  { name: "youtube", label: "YouTube", url: "https://www.youtube.com/@assembly" },
  { name: "instagram", label: "Instagram", url: "https://instagram.com/assembly" },
];

export function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "w-full border-t",
        "px-4 md:px-[var(--space-40)] py-[var(--space-64)]",
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
            <a href="https://assembly.com" target="_blank" rel="noopener noreferrer">
              <img
                src="/assets/icons/Logo.svg"
                alt="Assembly"
                height={38}
                className="h-[38px] w-auto self-start"
              />
            </a>
            <p
              className="text-[16px]"
              style={{
                color: "rgb(16, 16, 16)",
                lineHeight: "24px",
              }}
            >
              Create remarkable client experiences
            </p>

            {/* Social Icons */}
            <div className="flex items-center gap-[var(--space-24)]">
              {socialIcons.map((icon) => (
                <a
                  key={icon.name}
                  href={icon.url}
                  target="_blank"
                  rel="noopener noreferrer"
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

          {/* Link Columns — 3 columns per row, 3 rows = 9 columns total (last row has 2) */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-[var(--space-40)] gap-y-[var(--space-48)]">
            {linkColumns.map((col) => (
              <div key={col.title} className="flex flex-col gap-[16px]">
                <h3
                  className="text-[14px] font-semibold leading-[16px]"
                  style={{ color: "rgb(112, 112, 112)", letterSpacing: "0.28px" }}
                >
                  {col.title}
                </h3>
                <ul className="flex flex-col gap-[6px]">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[14px] leading-[16px] transition-colors hover:opacity-70"
                        style={{ color: "rgb(16, 16, 16)", letterSpacing: "0.28px" }}
                      >
                        {link.label}
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
