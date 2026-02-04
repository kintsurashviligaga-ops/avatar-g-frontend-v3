/**
 * Centralized Gemini API Client
 * Used across all Avatar G services for Georgian language support
 */

export interface GeminiRequest {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  language?: "ka" | "en";
}

export interface GeminiResponse {
  text: string;
  error?: string;
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

export async function callGemini(request: GeminiRequest): Promise<GeminiResponse> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "demo-key") {
    return {
      text: "Demo mode active. Add GEMINI_API_KEY to enable AI generation.",
      error: "NO_API_KEY",
    };
  }

  const systemContext = request.systemPrompt || 
    (request.language === "ka" 
      ? "შენ ხარ Avatar G-ის AI ასისტენტი. უპასუხე ქართულად, იყავი helpful და professional."
      : "You are Avatar G's AI assistant. Respond in English, be helpful and professional.");

  const fullPrompt = systemContext + "\n\n" + request.prompt;

  try {
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          temperature: request.temperature || 0.7,
          maxOutputTokens: request.maxTokens || 2048,
          topP: 0.95,
          topK: 40,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return {
        text: "AI generation temporarily unavailable. Please try again.",
        error: `API_ERROR_${response.status}`,
      };
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return {
        text: "No response generated. Please try again.",
        error: "EMPTY_RESPONSE",
      };
    }

    return { text };
  } catch (error: any) {
    console.error("Gemini API exception:", error);
    return {
      text: "AI generation error. Please try again later.",
      error: error.message,
    };
  }
}

// Service-specific system prompts
export const SERVICE_PROMPTS = {
  "text-intelligence": {
    ka: "შენ ხარ პროფესიონალური ტექსტის რედაქტორი და writer. დაეხმარე მომხმარებელს ტექსტის შექმნაში, რედაქტირებაში ან თარგმნაში. იყავი კრეატიული და ზუსტი.",
    en: "You are a professional text editor and writer. Help users create, edit, or translate text. Be creative and precise.",
  },
  "image-generator": {
    ka: "შენ ხარ AI image generation ექსპერტი. შექმენი დეტალური, კრეატიული image prompts რომლებიც შესანიშნავ ვიზუალურ შედეგებს მოიტანს.",
    en: "You are an AI image generation expert. Create detailed, creative image prompts that will produce excellent visual results.",
  },
  "music-studio": {
    ka: "შენ ხარ მუსიკის პროდიუსერი და კომპოზიტორი. დაეხმარე მომხმარებელს მუსიკის შექმნაში - შექმენი lyrics, აღწერე სტილი, ჟანრი და mood.",
    en: "You are a music producer and composer. Help users create music - generate lyrics, describe style, genre, and mood.",
  },
  "video-generator": {
    ka: "შენ ხარ ვიდეო რეჟისორი და სცენარისტი. შექმენი დეტალური ვიდეო სცენარები, shot descriptions და storyboards.",
    en: "You are a video director and screenwriter. Create detailed video scripts, shot descriptions, and storyboards.",
  },
  "voice-lab": {
    ka: "შენ ხარ voice-over და narration ექსპერტი. დაეხმარე მომხმარებელს სკრიპტის შექმნაში და voice direction-ში.",
    en: "You are a voice-over and narration expert. Help users create scripts and voice direction.",
  },
  "business-agent": {
    ka: "შენ ხარ ბიზნეს სტრატეგი და consultant. შექმენი დეტალური ბიზნეს გეგმები, მარკეტინგ სტრატეგიები და ფინანსური პროგნოზები.",
    en: "You are a business strategist and consultant. Create detailed business plans, marketing strategies, and financial projections.",
  },
  "game-forge": {
    ka: "შენ ხარ game designer. შექმენი სრული game design documents - gameplay mechanics, story, characters, levels.",
    en: "You are a game designer. Create complete game design documents - gameplay mechanics, story, characters, levels.",
  },
  "prompt-builder": {
    ka: "შენ ხარ AI prompt engineering ექსპერტი. ოპტიმიზაცია გაუკეთე prompts-ს რომ მიიღო საუკეთესო შედეგები AI models-გან.",
    en: "You are an AI prompt engineering expert. Optimize prompts to get the best results from AI models.",
  },
  "ai-production": {
    ka: "შენ ხარ production workflow ექსპერტი. შექმენი ეფექტური multi-step workflows კონტენტის პროდუქციისთვის.",
    en: "You are a production workflow expert. Create efficient multi-step workflows for content production.",
  },
};
