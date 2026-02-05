import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const systemPrompts: Record<string, string> = {
  general: "You are a helpful AI assistant.",
  code: "You are an expert programmer.",
  creative: "You are a creative writer.",
  executive: "You are an executive assistant."
};
export async function generateText(prompt: string, type: string = "general") {
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      { role: "system", content: systemPrompts[type] || systemPrompts.general },
      { role: "user", content: prompt }
    ],
    max_tokens: 2000,
    temperature: 0.7,
  });
  return { text: response.choices[0].message.content, tokens: response.usage?.total_tokens, model: response.model };
}
