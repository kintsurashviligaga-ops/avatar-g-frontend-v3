import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_FRONTEND_ORIGIN || "https://avatar-g-frontend-v3.vercel.app",
        "X-Title": "Avatar G",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-sonnet",
        messages: [
          { role: "system", content: "შენ ხარ Avatar G-ს AI ასისტენტი. უპასუხე ქართულ ენაზე. პასუხები იყოს მოკლე, ზუსტი და სასარგებლო." },
          { role: "user", content: message }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) throw new Error("OpenRouter API error");
    const data = await response.json();
    return NextResponse.json({ response: data.choices?.[0]?.message?.content || "ბოდიში, ვერ მივიღე პასუხი." });
  } catch (error) {
    console.error("OpenRouter error:", error);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
