import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, _identity, type = "general" } = body;

    if (!_identity?.avatarId) {
      return NextResponse.json(
        { error: "IdentityIntegrityError: Missing global identity" },
        { status: 403 }
      );
    }

    // Simulate OpenAI response
    const responses = {
      general: `პასუხი: "${content}"\n\nეს არის სიმულირებული პასუხი GPT-4-ისგან.`,
      code: `// კოდი: ${content}\nfunction example() {\n  return "Hello World";\n}`,
      creative: `შემოქმედებითი ტექსტი: ${content}`,
      executive: `EXECUTIVE SUMMARY\n\nმოთხოვნა: ${content}\nსტატუსი: დამუშავებულია\n`,
    };

    const result = {
      text: responses[type as keyof typeof responses] || responses.general,
      type,
      identity: {
        avatarId: _identity.avatarId,
        voiceId: _identity.voiceId,
        injected: true,
      },
      timestamp: new Date().toISOString(),
      model: "gpt-4",
      tokens: Math.floor(Math.random() * 1000) + 500,
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Text generation error:", error);
    return NextResponse.json(
      { error: error.message || "Generation failed" },
      { status: 500 }
    );
  }
}
