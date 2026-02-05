import { NextRequest, NextResponse } from "next/server";
import { generateText } from "@/lib/ai/openai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, _identity, type = "general" } = body;

    // Identity verification
    if (!_identity?.avatarId) {
      return NextResponse.json(
        { error: "IdentityIntegrityError: Missing global identity" },
        { status: 403 }
      );
    }

    // Call real OpenAI API
    const result = await generateText(content, type);

    return NextResponse.json({
      text: result.text,
      type,
      identity: {
        avatarId: _identity.avatarId,
        voiceId: _identity.voiceId,
        injected: true
      },
      timestamp: new Date().toISOString(),
      model: result.model,
      tokens: result.tokens
    });

  } catch (error: any) {
    console.error("Text generation error:", error);
    return NextResponse.json(
      { error: error.message || "Generation pipeline failed", code: "GEN-001" },
      { status: 500 }
    );
  }
}
