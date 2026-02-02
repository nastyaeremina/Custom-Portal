"use client";

import { PortalColors } from "@/types/api";

interface LoginViewProps {
  logoUrl: string | null;
  companyName: string;
  loginImage: string | null;
  colors: PortalColors;
}

export function LoginView({
  logoUrl,
  companyName,
  loginImage,
  colors,
}: LoginViewProps) {
  return (
    <div className="flex h-full rounded-xl overflow-hidden">
      {/* Login Form Side */}
      <div className="w-[45%] flex flex-col justify-center px-10 py-8 bg-white">
        {/* Logo */}
        <div className="mb-10">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-semibold"
              style={{
                backgroundColor: colors.sidebarBackground,
                color: colors.sidebarText,
              }}
            >
              {companyName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Form */}
        <div className="space-y-5 max-w-[240px]">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">
              Email
            </label>
            <input
              type="email"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md bg-white focus:outline-none"
              readOnly
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1.5">
              Password
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-md bg-white focus:outline-none"
              readOnly
            />
          </div>
          <button
            className="w-full py-2.5 px-4 text-sm font-medium rounded-md transition-colors mt-2"
            style={{
              backgroundColor: colors.sidebarBackground,
              color: colors.sidebarText,
            }}
          >
            Sign in
          </button>
        </div>
      </div>

      {/* Image Side */}
      <div className="w-[55%] relative">
        {loginImage ? (
          <img
            src={loginImage}
            alt="Login background"
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: `linear-gradient(135deg, ${colors.sidebarBackground} 0%, ${colors.accent} 100%)`,
            }}
          />
        )}
      </div>
    </div>
  );
}
