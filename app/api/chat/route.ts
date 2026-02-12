import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api/response";
import { checkRateLimit, RATE_LIMITS } from "@/lib/api/rate-limit";

// Validation schemas
const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  context: z.enum(["global", "music", "video", "avatar", "voice", "business"]).default("global"),
  conversationId: z.string().optional(),
  language: z.string().default("en"),
  metadata: z.record(z.any()).optional(),
});

type ChatRequest = z.infer<typeof chatRequestSchema>;

// Service-specific prompt engineering
const systemPrompts = {
  global: "You are Avatar G Assistant - a helpful AI for creating digital content. Be concise, creative, and professional.",
  music: "You are a Music Studio Assistant powered by Suno.ai. Help users create and generate amazing music. Provide lyrics suggestions, style advice, and production tips.",
  video: "You are a Video Studio Assistant. Help users conceptualize and generate video content using Runway AI technology. Be creative and technical.",
  avatar: "You are an Avatar Builder Assistant. Help users create and customize their digital avatars. Discuss styles, features, and personalization options.",
  voice: "You are a Voice Lab Assistant powered by ElevenLabs and Google TTS. Help users generate and customize voice content with attention to tone and emotion.",
  business: "You are the Avatar G Business Agent. Provide admin insights, usage analytics, billing information, and system status updates.",
};

// Handler for each service context
async function handleServiceChat(
  message: string,
  context: "global" | "music" | "video" | "avatar" | "voice" | "business",
  language: string = "en"
): Promise<{ text: string; provider: string }> {
  // Try OpenAI GPT-4 FIRST (if configured)
  if (process.env.OPENAI_API_KEY) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4-turbo",
          messages: [
            {
              role: "system",
              content: systemPrompts[context],
            },
            {
              role: "user",
              content: message,
            },
          ],
          max_tokens: 1500,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return { text, provider: "OpenAI GPT-4" };
        }
      }
    } catch (error) {
      console.warn("[Chat API] OpenAI fallback triggered", error);
    }
  }

  // Try Groq (faster, cheaper)
  if (process.env.GROQ_API_KEY) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mixtral-8x7b-32768",
          messages: [
            {
              role: "system",
              content: systemPrompts[context],
            },
            {
              role: "user",
              content: message,
            },
          ],
          max_tokens: 1000,
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return { text, provider: "Groq Mixtral" };
        }
      }
    } catch (error) {
      console.warn("[Chat API] Groq fallback triggered", error);
    }
  }

  // Local fallback
  const fallbackResponses: Record<string, string> = {
    global: "Hello! I'm Avatar G Assistant. I'm here to help you create amazing digital content. What would you like to build today?",
    music: "I'm your Music Studio Assistant! I can help you generate melodies, suggest lyrics, and discuss music styles. What kind of music are you thinking about?",
    video: "Welcome to Video Studio! Let's create something visual. What kind of video content interests you?",
    avatar: "I'm here to help you build your perfect digital avatar. What style or look are you going for?",
    voice: "Voice Lab ready! I can help generate custom voice content. What voice characteristics are you looking for?",
    business: "Business Agent ready. I can provide system status, usage reports, and analytics.",
  };

  return {
    text: fallbackResponses[context] || fallbackResponses.global,
    provider: "Local Fallback",
  };
}

export async function POST(req: NextRequest) {
  // Rate limiting
  const rateLimitError = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  try {
    // Parse and validate request body
    const body = await req.json();
    const parsedRequest = chatRequestSchema.safeParse(body);

    if (!parsedRequest.success) {
      return apiError(
        new Error("Validation failed"),
        400,
        "Invalid request format"
      );
    }

    const { message, context, conversationId, language, metadata } = parsedRequest.data;

    // Get response from appropriate handler
    const { text, provider } = await handleServiceChat(message, context, language);

    // TODO: Store conversation history in Supabase
    // TODO: Track tokens for billing
    // TODO: Log to analytics

    return apiSuccess({
      response: text,
      provider,
      context,
      conversationId: conversationId || `conv_${Date.now()}`,
      language,
      metadata,
    });
  } catch (error) {
    console.error("[Chat API Error]", error);
    return apiError(error, 500, "Chat service error");
  }
}

export async function GET() {
  return apiSuccess({
    status: "ok",
    service: "Avatar G Chat API",
    contexts: ["global", "music", "video", "avatar", "voice", "business"],
  });
}
