import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    console.log("🚀 Avatar generation API called");
    
    // Check if API key is configured
    if (!process.env.STABILITY_API_KEY) {
      console.error("❌ STABILITY_API_KEY not configured");
      return NextResponse.json(
        { error: "API key not configured. Please add STABILITY_API_KEY to environment variables." },
        { status: 500 }
      );
    }

    const { 
      imageBase64, 
      style, 
      fashion,
      prompt: customPrompt 
    } = await req.json();

    console.log("📝 Request data:", { 
      hasImage: !!imageBase64, 
      style: style?.artStyle,
      fashion: fashion?.outfit,
      customPrompt: !!customPrompt
    });

    // Use custom prompt if provided, otherwise build from style/fashion
    const prompt = customPrompt || buildPrompt(style, fashion);
    console.log("🎨 Generated prompt:", prompt);

    // Use Stability AI for avatar generation
    console.log("🔄 Calling Stability AI API...");
    const response = await fetch(
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.STABILITY_API_KEY}`,
        },
        body: JSON.stringify({
          text_prompts: [
            { text: prompt, weight: 1 },
            { text: "low quality, blurry, distorted", weight: -1 }
          ],
          cfg_scale: 7,
          samples: 1,
          width: 1024,
          height: 1024,
          steps: 50,
          style_preset: mapArtStyleToPreset(style.artStyle),
        }),
      }
    );

    console.log("📡 Stability AI response status:", response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ Stability AI error:", error);
      return NextResponse.json(
        { error: `Stability AI error: ${response.status} - ${error.substring(0, 200)}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log("✅ Received data from Stability AI");
    
    const imageBase64Result = data.artifacts?.[0]?.base64;

    if (!imageBase64Result) {
      console.error("❌ No image in response:", JSON.stringify(data).substring(0, 200));
      throw new Error("No image generated");
    }

    console.log("🎉 Avatar generated successfully!");
    return NextResponse.json({
      success: true,
      image: `data:image/png;base64,${imageBase64Result}`,
      prompt: prompt,
    });

  } catch (error: any) {
    console.error("💥 Avatar generation error:", error.message, error.stack);
    return NextResponse.json(
      { 
        error: error.message || "Failed to generate avatar",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

function buildPrompt(style: any, fashion: any): string {
  const parts = ["professional portrait photo,"];

  if (style) {
    if (style.artStyle) parts.push(`${style.artStyle} art style,`);
    if (style.age) parts.push(`${style.age} years old,`);
    if (style.hairStyle && style.hairColor) {
      parts.push(`${style.hairStyle.toLowerCase()} ${style.hairColor.toLowerCase()} hair,`);
    }
    if (style.eyeColor) parts.push(`${style.eyeColor.toLowerCase()} eyes,`);
    if (style.expression) parts.push(`${style.expression.toLowerCase()} expression,`);
  }

  if (fashion) {
    if (fashion.outfit) parts.push(`wearing ${fashion.outfit} outfit,`);
    if (fashion.accessories && fashion.accessories.length > 0) {
      parts.push(`with ${fashion.accessories.join(", ")},`);
    }
  }

  parts.push(
    "high quality, detailed, 4K resolution,",
    "professional photography, studio lighting,",
    "centered composition, clean background"
  );

  return parts.join(" ");
}

function mapArtStyleToPreset(artStyle: string): string {
  const mapping: Record<string, string> = {
    realistic: "photographic",
    anime: "anime",
    cartoon: "comic-book",
    cyberpunk: "neon-punk",
    fantasy: "fantasy-art",
  };
  return mapping[artStyle] || "photographic";
}
