export interface ScrapedImage {
  url: string;
  width?: number;
  height?: number;
  type: "favicon" | "logo" | "og" | "hero" | "background";
}

export interface ScrapedData {
  url: string;
  title: string | null;
  description: string | null;
  favicon: string | null;
  logo: string | null;
  ogImage: string | null;
  images: ScrapedImage[];
  colors: string[];
  meta: Record<string, string>;
}
