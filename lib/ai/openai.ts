import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateText(prompt: string, type: string = "general") {
  try {
    const systemPrompts: Record<string, string> = {
      general: "You are a helpful AI assistant. Provide clear, concise responses.",
      code: "You are an expert programmer. Write clean, well-documented code with explanations.",
      creative: "You are a creative writer. Write engaging, vivid content.",
      executive: "You are an executive assistant. Provide professional summaries with actionable insights."
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompts[type] || systemPrompts.general },
        { role: "user", content: prompt }
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    return {
      text: response.choices[0].message.content,
      tokens: response.usage?.total_tokens,
      model: response.model
    };
  } catch (error: any) {
    console.error("OpenAI error:", error);
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

export async function generateCode(prompt: string, language: string = "typescript") {
  return generateText(
    `Write ${language} code for: ${prompt}\n\nInclude comments and error handling.`,
    "code"
  );
}
