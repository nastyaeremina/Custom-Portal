import OpenAI from "openai";
import sharp from "sharp";
import { PortalColorScheme } from "../colors/types";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generate a login background image using DALL-E 3
 */
export async function generateLoginImage(
  colors: PortalColorScheme,
  companyName: string
): Promise<string> {
  const openai = getOpenAIClient();

  const prompt = `Create an abstract, professional background image for a business software login page.
Use a gradient or geometric pattern with these brand colors:
- Primary: ${colors.sidebarBackground}
- Accent: ${colors.accent}

Style guidelines:
- Modern, minimal, corporate-friendly aesthetic
- Abstract shapes, flowing gradients, or subtle geometric patterns
- No text, logos, faces, or identifiable objects
- Suitable for a professional B2B software login page
- Calming and elegant, not busy or distracting
- High quality, photorealistic rendering of abstract elements

The image should evoke professionalism and trust, suitable for a client portal.`;

  try {
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      style: "natural",
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error("DALL-E generation returned no image URL");
    }

    // Download and resize to exact dimensions
    const downloadResponse = await fetch(imageUrl);
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download generated image: ${downloadResponse.status}`);
    }

    const buffer = Buffer.from(await downloadResponse.arrayBuffer());
    const resized = await sharp(buffer)
      .resize(1160, 1160, { fit: "cover" })
      .png()
      .toBuffer();

    return `data:image/png;base64,${resized.toString("base64")}`;
  } catch (error) {
    console.error("Error generating image with DALL-E:", error);
    throw error;
  }
}

/**
 * Check if OpenAI API key is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
