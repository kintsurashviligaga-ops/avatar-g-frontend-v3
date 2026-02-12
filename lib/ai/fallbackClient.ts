interface AIGenerateOptions {
  prompt: string;
  type?: "text" | "code" | "creative" | "executive" | "chat";
  language?: "ka" | "en" | "ru";
}

interface AIProvider {
  name: string;
  generate: (options: AIGenerateOptions) => Promise<string>;
  isAvailable: () => boolean;
}

const openAIProvider: AIProvider = {
  name: "OpenAI",
  isAvailable: () => !!process.env.OPENAI_API_KEY,
  generate: async (options) => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: getSystemPrompt(options.type, options.language) },
          { role: "user", content: options.prompt }
        ]
      })
    });
    if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
  }
};

const grokProvider: AIProvider = {
  name: "Grok",
  isAvailable: () => !!process.env.XAI_API_KEY,
  generate: async (options) => {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "grok-beta",
        messages: [
          { role: "system", content: getSystemPrompt(options.type, options.language) },
          { role: "user", content: options.prompt }
        ]
      })
    });
    if (!response.ok) throw new Error(`Grok error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
  }
};

const deepSeekProvider: AIProvider = {
  name: "DeepSeek",
  isAvailable: () => !!process.env.DEEPSEEK_API_KEY,
  generate: async (options) => {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: getSystemPrompt(options.type, options.language) },
          { role: "user", content: options.prompt }
        ]
      })
    });
    if (!response.ok) throw new Error(`DeepSeek error: ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
  }
};

const geminiProvider: AIProvider = {
  name: "Gemini",
  isAvailable: () => !!process.env.GEMINI_API_KEY,
  generate: async (options) => {
    // SECURITY FIX: API key now in request body, not URL
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${getSystemPrompt(options.type, options.language)}\n\n${options.prompt}` }] }],
        apiKey: process.env.GEMINI_API_KEY
      })
    });
    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  }
};

const localProvider: AIProvider = {
  name: "Local",
  isAvailable: () => true,
  generate: async (options) => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const responses: Record<string, Record<string, string>> = {
      ka: {
        text: `პასუხი: "${options.prompt.slice(0, 50)}..."\n\nAI-მ დაამუშავა თქვენი მოთხოვნა.\nსანდოობა: 94.7%`,
        code: `// კოდი: ${options.prompt.slice(0, 30)}...\n\nfunction solution() {\n  const result = processData();\n  return result;\n}`,
        creative: `შემოქმედებითი ტექსტი: "${options.prompt.slice(0, 30)}..."\n\nციფრული სინათლის კორიდორებში...`,
        executive: `საქმიანი მიმოხილვა\n\nმოთხოვნა: ${options.prompt.slice(0, 30)}...\nსტატუსი: დამუშავებულია`,
        chat: `გამარჯობა! მე ვარ Avatar G Assistant.\n\nთქვენი შეკითხვა: "${options.prompt}"\n\nრით შემიძლია დაგეხმაროთ?`
      },
      en: {
        text: `Response: "${options.prompt.slice(0, 50)}..."\n\nAI processed your request.\nConfidence: 94.7%`,
        code: `// Code: ${options.prompt.slice(0, 30)}...\n\nfunction solution() {\n  const result = processData();\n  return result;\n}`,
        creative: `Creative text: "${options.prompt.slice(0, 30)}..."\n\nIn the neon-lit corridors...`,
        executive: `Executive Summary\n\nRequest: ${options.prompt.slice(0, 30)}...\nStatus: PROCESSED`,
        chat: `Hello! I am Avatar G Assistant.\n\nYour question: "${options.prompt}"\n\nHow can I help you?`
      }
    };
    const lang = options.language || "ka";
    const type = options.type || "text";
    return responses[lang]?.[type] || responses["ka"]["text"];
  }
};

function getSystemPrompt(type?: string, language?: string): string {
  const prompts: Record<string, Record<string, string>> = {
    ka: {
      text: "თქვენ ხართ Avatar G - AI ასისტენტი. უპასუხეთ ქართულად.",
      code: "თქვენ ხართ პროგრამისტი. დაწერეთ კოდი.",
      creative: "თქვენ ხართ მწერალი. დაწერეთ ტექსტი.",
      executive: "თქვენ ხართ ასისტენტი. შეჯამება.",
      chat: "თქვენ ხართ Avatar G Assistant."
    },
    en: {
      text: "You are Avatar G - AI Assistant.",
      code: "You are a programmer.",
      creative: "You are a writer.",
      executive: "You are an assistant.",
      chat: "You are Avatar G Assistant."
    }
  };
  return prompts[language || "ka"][type || "text"] || prompts["ka"]["text"];
}

const providers = [openAIProvider, grokProvider, deepSeekProvider, geminiProvider, localProvider];

export async function generateWithFallback(options: AIGenerateOptions): Promise<{
  text: string;
  provider: string;
  isRealAI: boolean;
}> {
  const errors: string[] = [];
  for (const provider of providers) {
    if (provider.isAvailable()) {
      try {
        console.log(`[AI] Trying ${provider.name}...`);
        const text = await provider.generate(options);
        console.log(`[AI] Success with ${provider.name}`);
        return { text, provider: provider.name, isRealAI: provider.name !== "Local" };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error(`[AI] ${provider.name} failed:`, message);
        errors.push(`${provider.name}: ${message}`);
        continue;
      }
    }
  }
  throw new Error(`All AI providers failed: ${errors.join(", ")}`);
}

export const generateText = (prompt: string, lang?: "ka" | "en" | "ru") => 
  generateWithFallback({ prompt, type: "text", language: lang });

export const generateCode = (prompt: string, lang?: "ka" | "en" | "ru") => 
  generateWithFallback({ prompt, type: "code", language: lang });

export const chat = (prompt: string, lang?: "ka" | "en" | "ru") => 
  generateWithFallback({ prompt, type: "chat", language: lang });

export default generateWithFallback;
