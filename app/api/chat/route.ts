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

    // Try Grok first
    if (process.env.XAI_API_KEY) {
      try {
        const response = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "grok-beta",
            messages: [
              { role: "system", content: "თქვენ ხართ Avatar G Assistant. უპასუხეთ ქართულად." },
              { role: "user", content: message }
            ],
            max_tokens: 1000
          })
        });

        if (response.ok) {
          const data = await response.json();
          return NextResponse.json({
            response: data.choices[0].message.content,
            provider: "Grok"
          });
        }
      } catch (e) {
        console.error("Grok error:", e);
      }
    }

    // Local fallback
    return NextResponse.json({
      response: `გამარჯობა! მე ვარ Avatar G Assistant.\n\nთქვენი შეკითხვა: "${message}"\n\nამჟამად მუშაობს ლოკალური რეჟიმში.`,
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
    grokConfigured: !!process.env.XAI_API_KEY
  });
}
