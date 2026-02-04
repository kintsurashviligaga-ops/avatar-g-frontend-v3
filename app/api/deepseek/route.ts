import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "შენ ხარ Avatar G-ს AI ასისტენტი. უპასუხე ქართულ ენაზე." },
          { role: "user", content: message }
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) throw new Error("DeepSeek API error");
    const data = await response.json();
    return NextResponse.json({ response: data.choices?.[0]?.message?.content || "ბოდიში, ვერ მივიღე პასუხი." });
  } catch (error) {
    console.error("DeepSeek error:", error);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
