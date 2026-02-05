import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, language = "ka" } = body;

    if (!message) {
      return NextResponse.json({ 
        response: "გთხოვთ, შეიყვანეთ შეტყობინება.",
        provider: "Local"
      });
    }

    // Try Gemini
    if (process.env.GEMINI_API_KEY) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ 
                parts: [{ 
                  text: language === "ka" ? `უპასუხე ქართულად: ${message}` : message 
                }] 
              }]
            })
          }
        );

        if (response.ok) {
          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return NextResponse.json({
              response: text,
              provider: "Gemini",
              language
            });
n          }
        }
      } catch (e) {
        console.error("Gemini error:", e);
      }
    }

    // Fallback
    return NextResponse.json({
      response: language === "ka" 
        ? `გამარჯობა! მე ვარ Avatar G Assistant.\n\nთქვენი შეკითხვა: "${message}"`
        : `Hello! I am Avatar G Assistant.\n\nYour question: "${message}"`,
      provider: "Local",
      fallback: true
    });

  } catch (error: any) {
    return NextResponse.json({
      response: "ბოდიში, ტექნიკური პრობლემა.",
      provider: "Error",
      error: error.message
    });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString()
  });
}
