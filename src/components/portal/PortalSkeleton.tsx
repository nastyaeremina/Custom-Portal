"use client";

import { Skeleton } from "@/components/ui/Skeleton";

export function PortalSkeleton() {
  return (
    <div className="flex h-[400px] rounded-xl overflow-hidden">
      {/* Left side - Form skeleton */}
      <div className="w-[45%] flex flex-col justify-center px-10 py-8 bg-white">
        {/* Logo skeleton */}
        <Skeleton className="w-9 h-9 rounded-lg mb-10" />

        {/* Form fields skeleton */}
        <div className="space-y-5 max-w-[240px]">
          <div>
            <Skeleton className="h-3 w-10 mb-1.5" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <div>
            <Skeleton className="h-3 w-14 mb-1.5" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
          <Skeleton className="h-10 w-full rounded-md mt-2" />
        </div>
      </div>

      {/* Right side - Image skeleton */}
      <div className="w-[55%]">
        <Skeleton className="w-full h-full rounded-none" />
      </div>
    </div>
  );
}
