import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `შენ ხარ Avatar G-ს AI ასისტენტი. უპასუხე ქართულ ენაზე.\n\nმომხმარებელი: ${message}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
      }),
    });

    if (!response.ok) throw new Error("Gemini API error");
    const data = await response.json();
    return NextResponse.json({ response: data.candidates?.[0]?.content?.parts?.[0]?.text || "ბოდიში, ვერ მივიღე პასუხი." });
  } catch (error) {
    console.error("Gemini error:", error);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
