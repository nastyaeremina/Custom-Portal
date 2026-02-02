"use client";

import { PortalData, RawOutputs } from "@/types/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { LoginView } from "./LoginView";
import { DashboardView } from "./DashboardView";
import { PortalSkeleton } from "./PortalSkeleton";

interface PortalPreviewProps {
  data: PortalData | null;
  rawOutputs: RawOutputs | null;
  isLoading: boolean;
}

export function PortalPreview({ data, rawOutputs, isLoading }: PortalPreviewProps) {
  if (isLoading) {
    return (
      <div className="w-full">
        <div className="bg-[#f5f3ef] rounded-t-2xl p-2">
          <PortalSkeleton />
        </div>
        <div className="flex justify-center py-3 bg-[#f5f3ef] rounded-b-2xl border-t border-neutral-200/50">
          <div className="inline-flex items-center gap-0.5 p-1 bg-white rounded-full shadow-sm">
            <div className="px-4 py-1.5 text-sm font-medium rounded-full bg-neutral-100 text-neutral-900">
              Raw
            </div>
            <div className="px-4 py-1.5 text-sm font-medium rounded-full text-neutral-500">
              Log In
            </div>
            <div className="px-4 py-1.5 text-sm font-medium rounded-full text-neutral-500">
              Dashboard
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <Tabs defaultValue="raw" className="w-full">
      {/* Preview Container */}
      <div className="bg-[#f5f3ef] rounded-t-2xl p-2">
        <div className="min-h-[400px]">
          <TabsContent value="raw" className="h-full">
            <div className="p-4 bg-white rounded-xl h-full overflow-y-auto">
              {/* Structured Outputs Section */}
              <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Structured Outputs</h3>
              <div className="space-y-4">
                {/* Company Name */}
                <div>
                  <p className="text-[10px] text-neutral-500 mb-0.5">Company Name</p>
                  <p className="text-sm font-medium text-neutral-900">{data.companyName}</p>
                </div>

                {/* Colors */}
                <div>
                  <p className="text-[10px] text-neutral-500 mb-1.5">Colors</p>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-6 h-6 rounded border border-neutral-200 flex-shrink-0"
                        style={{ backgroundColor: data.colors.sidebarBackground }}
                      />
                      <div>
                        <p className="text-[10px] text-neutral-500 leading-tight">Sidebar BG</p>
                        <p className="font-mono text-[10px] text-neutral-900">{data.colors.sidebarBackground}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-6 h-6 rounded border border-neutral-200 flex-shrink-0"
                        style={{ backgroundColor: data.colors.sidebarText }}
                      />
                      <div>
                        <p className="text-[10px] text-neutral-500 leading-tight">Sidebar Text</p>
                        <p className="font-mono text-[10px] text-neutral-900">{data.colors.sidebarText}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-6 h-6 rounded border border-neutral-200 flex-shrink-0"
                        style={{ backgroundColor: data.colors.accent }}
                      />
                      <div>
                        <p className="text-[10px] text-neutral-500 leading-tight">Accent</p>
                        <p className="font-mono text-[10px] text-neutral-900">{data.colors.accent}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Images */}
                <div>
                  <p className="text-[10px] text-neutral-500 mb-1.5">Images</p>
                  <div className="grid grid-cols-4 gap-3">
                    {/* Square Icon */}
                    <div>
                      <div className="w-full aspect-square bg-neutral-100 rounded border border-neutral-200 overflow-hidden mb-1">
                        {data.images.squareIcon ? (
                          <img src={data.images.squareIcon} alt="Square Icon" className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[10px]">None</div>
                        )}
                      </div>
                      <p className="text-[10px] text-neutral-500 leading-tight">Square Icon</p>
                      <p className="text-[9px] text-neutral-400">300×300</p>
                    </div>
                    {/* Full Logo */}
                    <div>
                      <div className="w-full aspect-square bg-neutral-100 rounded border border-neutral-200 overflow-hidden mb-1 flex items-center justify-center">
                        {data.images.fullLogo ? (
                          <img src={data.images.fullLogo} alt="Full Logo" className="max-w-full max-h-full object-contain p-0.5" />
                        ) : (
                          <div className="text-neutral-400 text-[10px]">None</div>
                        )}
                      </div>
                      <p className="text-[10px] text-neutral-500 leading-tight">Full Logo</p>
                      <p className="text-[9px] text-neutral-400">min 180px h</p>
                    </div>
                    {/* Login Image */}
                    <div>
                      <div className="w-full aspect-square bg-neutral-100 rounded border border-neutral-200 overflow-hidden mb-1">
                        {data.images.loginImage ? (
                          <img src={data.images.loginImage} alt="Login Image" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[10px]">None</div>
                        )}
                      </div>
                      <p className="text-[10px] text-neutral-500 leading-tight">Login Image</p>
                      <p className="text-[9px] text-neutral-400">1160×1160</p>
                    </div>
                    {/* Social Image */}
                    <div>
                      <div className="w-full aspect-square bg-neutral-100 rounded border border-neutral-200 overflow-hidden mb-1 flex items-center justify-center">
                        {data.images.socialImage ? (
                          <img src={data.images.socialImage} alt="Social Image" className="max-w-full max-h-full object-contain" />
                        ) : (
                          <div className="text-neutral-400 text-[10px]">None</div>
                        )}
                      </div>
                      <p className="text-[10px] text-neutral-500 leading-tight">Social Image</p>
                      <p className="text-[9px] text-neutral-400">1200×630</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Generations Section */}
              <div className="mt-6 pt-4 border-t border-neutral-100">
                <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">AI Generations</h3>
                <div>
                  <div className="w-40 aspect-square bg-neutral-100 rounded border border-neutral-200 overflow-hidden mb-1">
                    {rawOutputs?.dalleImageUrl ? (
                      <img src={rawOutputs.dalleImageUrl} alt="DALL-E Generated" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[10px]">Generating...</div>
                    )}
                  </div>
                  <p className="text-[10px] text-neutral-500 leading-tight">DALL-E 3 Generated</p>
                  <p className="text-[9px] text-neutral-400">1024×1024 (cropped for login/social)</p>
                </div>
              </div>

              {/* Debug Data Section */}
              {rawOutputs && (
                <div className="mt-6 pt-4 border-t border-neutral-100">
                  <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Debug Data</h3>
                  <div className="grid grid-cols-3 gap-4 text-[10px]">
                    <div>
                      <p className="text-neutral-500 mb-1">Scraped Colors ({rawOutputs.scrapedColors.length})</p>
                      <div className="flex flex-wrap gap-0.5">
                        {rawOutputs.scrapedColors.slice(0, 16).map((color, i) => (
                          <div
                            key={i}
                            className="w-4 h-4 rounded border border-neutral-200"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                        {rawOutputs.scrapedColors.length > 16 && (
                          <span className="text-neutral-400 text-[10px] self-center ml-0.5">+{rawOutputs.scrapedColors.length - 16}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-neutral-500 mb-1">ColorThief Palette</p>
                      <div className="flex flex-wrap gap-0.5">
                        {rawOutputs.colorThiefPalette.map((color, i) => (
                          <div
                            key={i}
                            className="w-4 h-4 rounded border border-neutral-200"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-0.5 text-neutral-600">
                      <p>Favicon: {rawOutputs.faviconUrl ? "Found" : "Not found"}</p>
                      <p>Logo: {rawOutputs.logoUrl ? "Found" : "Not found"}</p>
                      <p>Scraped Images: {rawOutputs.scrapedImages.length}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="login" className="h-full">
            <LoginView
              logoUrl={data.images.fullLogo}
              companyName={data.companyName}
              loginImage={data.images.loginImage}
              colors={data.colors}
            />
          </TabsContent>

          <TabsContent value="dashboard" className="h-full">
            <DashboardView
              companyName={data.companyName}
              logoUrl={data.images.squareIcon}
              colors={data.colors}
            />
          </TabsContent>
        </div>
      </div>

      {/* Tabs positioned below the preview */}
      <div className="flex justify-center py-3 bg-[#f5f3ef] rounded-b-2xl border-t border-neutral-200/50">
        <TabsList className="bg-white shadow-sm">
          <TabsTrigger value="raw">Raw</TabsTrigger>
          <TabsTrigger value="login">Log In</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>
      </div>
    </Tabs>
  );
}
