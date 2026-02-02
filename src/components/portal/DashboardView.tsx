"use client";

import { PortalColors } from "@/types/api";
import { Sidebar } from "./Sidebar";
import { Skeleton } from "@/components/ui/Skeleton";

interface DashboardViewProps {
  companyName: string;
  logoUrl: string | null;
  colors: PortalColors;
}

export function DashboardView({
  companyName,
  logoUrl,
  colors,
}: DashboardViewProps) {
  return (
    <div className="flex h-full rounded-xl overflow-hidden">
      <Sidebar
        companyName={companyName}
        logoUrl={logoUrl}
        backgroundColor={colors.sidebarBackground}
        textColor={colors.sidebarText}
      />

      {/* Main Content */}
      <div className="flex-1 bg-white p-6 rounded-r-xl">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-md border border-neutral-200 max-w-md">
            <svg className="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-sm text-neutral-400">Search...</span>
          </div>
        </div>

        {/* Welcome Section */}
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 mb-4">Welcome</h1>

          {/* Skeleton content to match the mockup */}
          <div className="space-y-2.5 max-w-sm">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[85%]" />
            <Skeleton className="h-3.5 w-[70%]" />
          </div>
        </div>
      </div>
    </div>
  );
}
