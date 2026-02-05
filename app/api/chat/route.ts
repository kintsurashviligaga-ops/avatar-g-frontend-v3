import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  console.log("[Chat] Starting request");

  try {
    const body = await req.json();
    const { message, language = "ka" } = body;
    console.log("[Chat] Message:", message, "Language:", language);

    if (!message) {
      return NextResponse.json({ 
        response: "გთხოვთ, შეიყვანეთ შეტყობინება.",
        provider: "Local"
      });
    }

    // Try OpenAI GPT-4 FIRST
    if (process.env.OPENAI_API_KEY) {
      try {
        console.log("[Chat] Calling OpenAI GPT-4...");
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-4",
            messages: [
              { 
                role: "system", 
                content: language === "ka" 
                  ? "თქვენ ხართ Avatar G Assistant. უპასუხეთ მხოლოდ ქართულ ენაზე."
                  : "You are Avatar G Assistant."
              },
              { role: "user", content: message }
            ],
            max_tokens: 1000
          })
        });

        console.log("[Chat] OpenAI status:", response.status);

        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) {
            console.log("[Chat] OpenAI success");
            return NextResponse.json({
              response: text,
              provider: "OpenAI GPT-4",
              language
            });
          }
        }
      } catch (e) {
        console.error("[Chat] OpenAI error:", e);
      }
    }

    // Local fallback
    return NextResponse.json({
      response: language === "ka" 
        ? `გამარჯობა! მე ვარ Avatar G Assistant.\n\nთქვენი შეკითხვა: "${message}"\n\nOpenAI: ${process.env.OPENAI_API_KEY ? "✅" : "❌"}`
        : `Hello! I am Avatar G Assistant.\n\nYour question: "${message}"`,
      provider: "Local",
      fallback: true
    });

  } catch (error: any) {
    return NextResponse.json({
      response: "ბოდიში, ტექნიკური პრობლემა.",
      provider: "Error"
    });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString()
  });
}
