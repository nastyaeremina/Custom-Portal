"use client";

import { PortalData, RawOutputs, DalleGeneration } from "@/types/api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { LoginView } from "./LoginView";
import { DashboardView } from "./DashboardView";
import { PortalSkeleton } from "./PortalSkeleton";

interface PortalPreviewProps {
  data: PortalData | null;
  rawOutputs: RawOutputs | null;
  isLoading: boolean;
}

function DalleGenerationCard({ generation }: { generation: DalleGeneration }) {
  const approachLabels: Record<string, string> = {
    logo_centered: "Approach 1: Logo/Icon Centered",
    accent_wave: "Approach 2: Accent Wave Pattern",
    gradient: "Approach 3: Color Gradient",
  };

  const statusColors = {
    pending: "bg-neutral-100 text-neutral-500",
    generating: "bg-blue-100 text-blue-700",
    complete: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  };

  return (
    <div className="bg-neutral-50 rounded-lg p-3">
      <div className="flex items-start gap-3">
        {/* Image preview */}
        <div className="w-24 h-24 bg-neutral-200 rounded border border-neutral-300 overflow-hidden flex-shrink-0">
          {generation.status === "complete" && generation.imageUrl ? (
            <img
              src={generation.imageUrl}
              alt={approachLabels[generation.approach]}
              className="w-full h-full object-cover"
            />
          ) : generation.status === "generating" ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
            </div>
          ) : generation.status === "error" ? (
            <div className="w-full h-full flex items-center justify-center text-red-400 text-[10px] text-center p-1">
              Failed
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-[10px]">
              Pending
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[11px] font-medium text-neutral-700">
              {approachLabels[generation.approach]}
            </p>
            <span className={`px-1.5 py-0.5 rounded text-[9px] ${statusColors[generation.status]}`}>
              {generation.status}
            </span>
          </div>

          {/* Prompt */}
          <div className="mt-1">
            <p className="text-[9px] text-neutral-400 mb-0.5">Prompt:</p>
            <p className="text-[10px] text-neutral-600 leading-relaxed line-clamp-[7] bg-white rounded p-1.5 border border-neutral-200">
              {generation.prompt}
            </p>
          </div>

          {generation.error && (
            <p className="text-[10px] text-red-600 mt-1">Error: {generation.error}</p>
          )}
        </div>
      </div>
    </div>
  );
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
              {/* ==================== CUSTOMIZATION OUTPUTS ==================== */}
              <h2 className="text-sm font-semibold text-neutral-900 mb-4">Customization Outputs</h2>

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
                      <p className="text-[9px] text-neutral-400">300x300</p>
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
                      <p className="text-[9px] text-neutral-400">1160x1160</p>
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
                      <p className="text-[9px] text-neutral-400">1200x630</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ==================== DEBUGGING ==================== */}
              <div className="mt-8 pt-6 border-t border-neutral-200">
                <h2 className="text-sm font-semibold text-neutral-900 mb-4">Debugging</h2>

                {/* AI Generations Section */}
                <div className="mb-6">
                  <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Image Generations</h3>

                  {rawOutputs?.dalleGenerations && rawOutputs.dalleGenerations.length > 0 ? (
                    <div className="space-y-3">
                      {rawOutputs.dalleGenerations.map((gen, index) => (
                        <DalleGenerationCard key={index} generation={gen} />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-neutral-50 rounded-lg p-4 text-center text-[11px] text-neutral-500">
                      {rawOutputs?.generatedWithDalle === false
                        ? "DALL-E generation skipped (OpenAI API not configured)"
                        : "Waiting for AI generation..."}
                    </div>
                  )}
                </div>

                {/* Color Selection Logic Section */}
                {rawOutputs && (
                  <div className="mb-6">
                    <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">Color Selection Logic</h3>

                    <div className="space-y-3">
                      {/* Accent Color */}
                      <div className="bg-neutral-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-5 h-5 rounded border border-neutral-300"
                            style={{ backgroundColor: data.colors.accent }}
                          />
                          <p className="text-[11px] font-medium text-neutral-700">Accent Color</p>
                          <span className="font-mono text-[10px] text-neutral-500">{data.colors.accent}</span>
                        </div>
                        <div className="text-[10px] text-neutral-600 space-y-1">
                          {rawOutputs.accentColorSource === "squareIcon" && (
                            <p>
                              <span className="text-neutral-400">Source:</span> Extracted from favicon
                              {rawOutputs.faviconUrl && (
                                <img src={rawOutputs.faviconUrl} alt="favicon" className="inline-block w-4 h-4 ml-1 rounded" />
                              )}
                            </p>
                          )}
                          {rawOutputs.accentColorSource === "logo" && (
                            <p>
                              <span className="text-neutral-400">Source:</span> Extracted from logo
                              {rawOutputs.logoUrl && (
                                <img src={rawOutputs.logoUrl} alt="logo" className="inline-block h-4 ml-1 rounded" />
                              )}
                            </p>
                          )}
                          {rawOutputs.accentColorSource === "linkButton" && (
                            <p><span className="text-neutral-400">Source:</span> Extracted from page link/button colors</p>
                          )}
                          {rawOutputs.accentColorSource === "none" && (
                            <p><span className="text-neutral-400">Source:</span> Default fallback (no suitable color found)</p>
                          )}
                          {rawOutputs.accentColorConfidence && (
                            <p>
                              <span className="text-neutral-400">Confidence:</span>{" "}
                              <span className={`px-1.5 py-0.5 rounded text-[9px] ${
                                rawOutputs.accentColorConfidence === "high"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-yellow-100 text-yellow-700"
                              }`}>
                                {rawOutputs.accentColorConfidence === "high" ? "High (saturation > 30%)" : "Low (saturation 10-30%)"}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Sidebar Background */}
                      <div className="bg-neutral-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-5 h-5 rounded border border-neutral-300"
                            style={{ backgroundColor: data.colors.sidebarBackground }}
                          />
                          <p className="text-[11px] font-medium text-neutral-700">Sidebar Background</p>
                          <span className="font-mono text-[10px] text-neutral-500">{data.colors.sidebarBackground}</span>
                        </div>
                        <div className="text-[10px] text-neutral-600 space-y-1">
                          {rawOutputs.sidebarColorSource === "navHeader" && rawOutputs.navHeaderBackground && (
                            <>
                              <p>
                                <span className="text-neutral-400">Source:</span> Nav/header background color
                                <span
                                  className="inline-block w-3 h-3 rounded border border-neutral-300 ml-1 align-middle"
                                  style={{ backgroundColor: rawOutputs.navHeaderBackground }}
                                />
                                <span className="font-mono ml-1">{rawOutputs.navHeaderBackground}</span>
                              </p>
                              <p><span className="text-neutral-400">Reason:</span> Nav luminance &le; 186 (dark/medium nav detected)</p>
                            </>
                          )}
                          {rawOutputs.sidebarColorSource === "accent" && (
                            <>
                              <p>
                                <span className="text-neutral-400">Source:</span> Using accent color as sidebar
                              </p>
                              <p>
                                <span className="text-neutral-400">Reason:</span>{" "}
                                {rawOutputs.navHeaderBackground
                                  ? "Nav luminance > 186 (light nav detected)"
                                  : "No nav/header background found"
                                }
                              </p>
                            </>
                          )}
                          {rawOutputs.sidebarColorSource === "default" && (
                            <>
                              <p><span className="text-neutral-400">Source:</span> Default fallback</p>
                              <p><span className="text-neutral-400">Reason:</span> No nav background or accent color available</p>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Sidebar Text */}
                      <div className="bg-neutral-50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-5 h-5 rounded border border-neutral-300"
                            style={{ backgroundColor: data.colors.sidebarText }}
                          />
                          <p className="text-[11px] font-medium text-neutral-700">Sidebar Text</p>
                          <span className="font-mono text-[10px] text-neutral-500">{data.colors.sidebarText}</span>
                        </div>
                        <div className="text-[10px] text-neutral-600">
                          <p>
                            <span className="text-neutral-400">Reason:</span>{" "}
                            {data.colors.sidebarText === "#ffffff" || data.colors.sidebarText === "#fff"
                              ? "Sidebar luminance <= 186 -> light text for contrast"
                              : "Sidebar luminance > 186 -> dark text for contrast"
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scraped Images */}
                {rawOutputs && rawOutputs.scrapedImages.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
                      Scraped Images ({rawOutputs.scrapedImages.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {rawOutputs.scrapedImages.slice(0, 8).map((img, i) => (
                        <div key={i} className="relative">
                          <div className="w-16 h-16 bg-neutral-100 rounded border border-neutral-200 overflow-hidden">
                            <img
                              src={img.url}
                              alt={`Scraped ${i + 1}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </div>
                          <span className="absolute -top-1 -right-1 bg-neutral-700 text-white text-[8px] px-1 rounded">
                            {img.type}
                          </span>
                          {img.width && img.height && (
                            <p className="text-[8px] text-neutral-400 text-center mt-0.5">
                              {img.width}x{img.height}
                            </p>
                          )}
                        </div>
                      ))}
                      {rawOutputs.scrapedImages.length > 8 && (
                        <div className="w-16 h-16 bg-neutral-100 rounded border border-neutral-200 flex items-center justify-center text-neutral-400 text-[10px]">
                          +{rawOutputs.scrapedImages.length - 8}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
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
