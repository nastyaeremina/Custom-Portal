"use client";

import type { PreviewBranding, PreviewTheme } from "@/types/preview";
import { CompanyLogo } from "./CompanyLogo";
import { Sidebar } from "./Sidebar";

interface MessagesViewProps {
  branding: PreviewBranding;
  theme: PreviewTheme;
  welcomeMessageText: string;
}

/**
 * Ana Eremina avatar — always static.
 * Background color #FBF1F3, initials "AE" in #B34B5F.
 * Never derived from theme or brand colors.
 */
const ANA_AVATAR_BG = "#FBF1F3";

export function MessagesView({
  branding,
  theme,
  welcomeMessageText,
}: MessagesViewProps) {
  const { companyName, logoUrl, squareIconBg, logoDominantColor, squareIconFg } = branding;

  return (
    <div
      className="flex h-full rounded-l-[6px] overflow-hidden bg-white"
      style={{ fontFamily: "var(--font-portal)" }}
    >
      <Sidebar branding={branding} theme={theme} activeItem="messages" />

      {/* ─── Main content ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header bar */}
        <div
          className="flex items-center px-4 border-b border-neutral-200"
          style={{ minHeight: "36px" }}
        >
          <span className="text-[10px] font-medium" style={{ color: "#212B36" }}>
            {companyName}
          </span>
        </div>

        {/* Message thread */}
        <div className="flex-1 flex flex-col px-3 py-[11px] gap-[5px] overflow-hidden">
          {/* ── Message 1: Company ── */}
          <div className="flex gap-2.5">
            {/* Avatar: company logo — circular, same size as user avatar */}
            <CompanyLogo logoUrl={logoUrl} companyName={companyName} variant="messages" squareIconBg={squareIconBg} logoDominantColor={logoDominantColor} squareIconFg={squareIconFg} accentColor={theme.accent} sidebarBackground={theme.sidebarBackground} />

            {/* Message content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-[12px] font-medium" style={{ color: "#212B36" }}>
                  {companyName}
                </span>
                <span className="text-[12px]" style={{ color: "#6B7280" }}>
                  1:34 PM
                </span>
              </div>
              <p className="text-[13px] leading-[22px]" style={{ color: "#212B36" }}>
                {welcomeMessageText}
              </p>
            </div>
          </div>

          {/* ── Message 2: Ana Eremina (static) ── */}
          <div className="flex gap-2.5">
            {/* Avatar: initials "AE" on fixed pink bg */}
            <div
              className="w-[32px] h-[32px] rounded-full border border-neutral-200 flex items-center justify-center shrink-0"
              style={{ backgroundColor: ANA_AVATAR_BG }}
            >
              <span className="text-[10px] font-medium" style={{ color: "#B34B5F" }}>
                AE
              </span>
            </div>

            {/* Message content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-[12px] font-medium" style={{ color: "#212B36" }}>
                  Ana Eremina
                </span>
                <span className="text-[12px]" style={{ color: "#6B7280" }}>
                  1:36 PM
                </span>
              </div>
              <p className="text-[13px] leading-[22px]" style={{ color: "#212B36" }}>
                Absolutely! Thank you!
              </p>
            </div>
          </div>
        </div>

        {/* Message input area */}
        <div className="border-t border-neutral-200 px-[18px] py-[11px]">
          <div
            className="w-full px-3 py-2 text-[10px] rounded-[4px] border border-neutral-200 bg-white"
            style={{ color: "#9CA3AF" }}
          >
            Type a message...
          </div>
        </div>
      </div>
    </div>
  );
}
