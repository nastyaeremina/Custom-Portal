"use client";

import type { PreviewBranding, PreviewTheme } from "@/types/preview";
import { CompanyLogo } from "./CompanyLogo";

interface LoginViewProps {
  branding: PreviewBranding;
  theme: PreviewTheme;
  loginHeroImageUrl: string | null;
}

export function LoginView({
  branding,
  theme,
  loginHeroImageUrl,
}: LoginViewProps) {
  const { companyName, logoUrl } = branding;
  const { sidebarBackground, sidebarText } = theme;

  return (
    <div
      className="flex h-full rounded-l-[6px] overflow-hidden bg-white"
      style={{ fontFamily: "var(--font-portal)" }}
    >
      {/* ─── Left: Login form ─── */}
      <div className="w-[45%] flex flex-col justify-center px-8 py-6">
        {/* Company logo */}
        <div className="mb-8 flex justify-center">
          <CompanyLogo logoUrl={logoUrl} companyName={companyName} variant="login" />
        </div>

        {/* Form fields */}
        <div className="flex flex-col gap-[10px] max-w-[287px] mx-auto w-full">
          {/* Google SSO */}
          <div className="flex flex-col gap-[10px]">
            <button
              className="flex items-center justify-center gap-[5px] w-full py-[8px] px-[16px] text-[11px] font-medium rounded-[3px] border border-black/10 bg-transparent"
              style={{ color: "#212B36" }}
            >
              {/* Google "G" icon */}
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M11.5619 6.27715C11.5619 5.8774 11.526 5.49302 11.4594 5.12402H6.1499V7.30727H9.1839C9.05065 8.0094 8.6509 8.6039 8.05128 9.00365V10.4233H9.8809C10.9469 9.43927 11.5619 7.99402 11.5619 6.27715Z" fill="#4285F4"/>
                <path d="M6.14994 11.7873C7.67206 11.7873 8.94819 11.2851 9.88094 10.4241L8.05131 9.00445C7.54906 9.3427 6.90844 9.5477 6.14994 9.5477C4.68419 9.5477 3.43881 8.55857 2.99294 7.22607H1.11719V8.68157C2.04481 10.5214 3.94619 11.7873 6.14994 11.7873Z" fill="#34A853"/>
                <path d="M2.99271 7.22031C2.87996 6.88206 2.81333 6.52331 2.81333 6.14918C2.81333 5.77506 2.87996 5.41631 2.99271 5.07806V3.62256H1.11696C0.732582 4.38106 0.512207 5.23693 0.512207 6.14918C0.512207 7.06143 0.732582 7.91731 1.11696 8.67581L2.57758 7.53806L2.99271 7.22031Z" fill="#FBBC05"/>
                <path d="M6.14994 2.75647C6.98019 2.75647 7.71819 3.04347 8.30756 3.59697L9.92194 1.98259C8.94306 1.07034 7.67206 0.511719 6.14994 0.511719C3.94619 0.511719 2.04481 1.77759 1.11719 3.62259L2.99294 5.07809C3.43881 3.74559 4.68419 2.75647 6.14994 2.75647Z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-neutral-200" />
              <span className="text-[9px] text-neutral-400">or</span>
              <div className="flex-1 h-px bg-neutral-200" />
            </div>
          </div>

          {/* Email + Password inputs */}
          <div className="flex flex-col gap-[19px]">
            {/* Email */}
            <div className="flex flex-col gap-[3px]">
              <label className="text-[9px] font-medium" style={{ color: "#212B36" }}>
                Email
              </label>
              <input
                type="email"
                className="w-full px-2.5 py-[7px] text-[10px] border border-neutral-200 rounded-[3px] bg-white focus:outline-none"
                readOnly
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-[3px]">
              <label className="text-[9px] font-medium" style={{ color: "#212B36" }}>
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  className="w-full px-2.5 py-[7px] text-[10px] border border-neutral-200 rounded-[3px] bg-white focus:outline-none pr-8"
                  readOnly
                />
                {/* Eye icon (password visibility) */}
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M6.83274 2.65744C5.28575 2.65744 4.01399 3.35976 3.03882 4.26375C2.12533 5.11317 1.4942 6.12156 1.17151 6.83337C1.4942 7.54517 2.12533 8.55357 3.03644 9.40299C4.01399 10.307 5.28575 11.0093 6.83274 11.0093C8.37973 11.0093 9.65149 10.307 10.6267 9.40299C11.5401 8.55357 12.1713 7.54517 12.494 6.83337C12.1713 6.12156 11.5401 5.11317 10.629 4.26375C9.65149 3.35976 8.37973 2.65744 6.83274 2.65744ZM2.26295 3.43094C3.38048 2.3917 4.91561 1.51855 6.83274 1.51855C8.74987 1.51855 10.285 2.3917 11.4025 3.43094C12.5129 4.46306 13.2556 5.69448 13.6091 6.54153C13.6874 6.72897 13.6874 6.93777 13.6091 7.12521C13.2556 7.97226 12.5129 9.20605 11.4025 10.2358C10.285 11.275 8.74987 12.1482 6.83274 12.1482C4.91561 12.1482 3.38048 11.275 2.26295 10.2358C1.15253 9.20605 0.409881 7.97226 0.058724 7.12521C-0.0195747 6.93777-0.0195747 6.72897 0.058724 6.54153C0.409881 5.69448 1.15253 4.46068 2.26295 3.43094ZM6.83274 8.73152C7.88147 8.73152 8.73089 7.8821 8.73089 6.83337C8.73089 5.78464 7.88147 4.93522 6.83274 4.93522C6.81613 4.93522 6.8019 4.93522 6.78529 4.93522C6.81613 5.05623 6.83274 5.18435 6.83274 5.31485C6.83274 6.15241 6.15178 6.83337 5.31422 6.83337C5.18372 6.83337 5.0556 6.81676 4.93459 6.78592C4.93459 6.80252 4.93459 6.81676 4.93459 6.83337C4.93459 7.8821 5.78401 8.73152 6.83274 8.73152ZM6.83274 3.79633C7.63821 3.79633 8.41069 4.1163 8.98025 4.68586C9.5498 5.25541 9.86978 6.0279 9.86978 6.83337C9.86978 7.63884 9.5498 8.41132 8.98025 8.98088C8.41069 9.55043 7.63821 9.87041 6.83274 9.87041C6.02727 9.87041 5.25479 9.55043 4.68523 8.98088C4.11568 8.41132 3.7957 7.63884 3.7957 6.83337C3.7957 6.0279 4.11568 5.25541 4.68523 4.68586C5.25479 4.1163 6.02727 3.79633 6.83274 3.79633Z" fill="currentColor"/>
                  </svg>
                </span>
              </div>
            </div>
          </div>

          {/* Sign in button */}
          <button
            className="w-full py-[8px] px-[16px] text-[11px] font-medium rounded-[3px] mt-1"
            style={{
              backgroundColor: sidebarBackground,
              color: sidebarText,
            }}
          >
            Sign in
          </button>
        </div>
      </div>

      {/* ─── Right: Hero image ─── */}
      <div className="w-[55%] relative bg-neutral-100">
        {loginHeroImageUrl && (
          <img
            src={loginHeroImageUrl}
            alt="Login background"
            className="w-full h-full object-cover"
          />
        )}
      </div>
    </div>
  );
}
