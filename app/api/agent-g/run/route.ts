// ============================================================
// app/api/agent-g/run/route.ts
// ============================================================
import { NextResponse } from "next/server";
import { smartAICall } from "@/lib/api/aiRouter";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt, language = "en", params = {} } = body;

    // If an avatar is bound, inject its personality into system prompt
    const avatar = params.avatar || {};
    let system =
      language === "ka"
        ? "შენ ხარ Agent G — პერსონალური AI აგენტი."
        : "You are Agent G — a personal AI agent with full control over tasks.";

    if (avatar.identity?.name) {
      system += language === "ka"
        ? ` შენ ხარ ${avatar.identity.name}-ი ავატარი. ${avatar.identity.bio || ""}`
        : ` You are acting as ${avatar.identity.name}. ${avatar.identity.bio || ""}`;
    }

    const result = await smartAICall({
      prompt,
      taskType: "conversation",
      systemPrompt: system,
      language,
      temperature: params.temperature ?? 0.7,
      maxTokens: params.maxTokens ?? 2048,
    });

    return NextResponse.json({
      success: true,
      output: { type: "text", text: result.text },
      provider: result.provider,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, output: { type: "text", text: "" }, error: err.message }, { status: 200 });
  }
}

