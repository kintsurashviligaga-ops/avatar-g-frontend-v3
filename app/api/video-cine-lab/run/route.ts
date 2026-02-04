// app/api/video-cine-lab/run/route.ts
import { NextRequest, NextResponse } from "next/server";
import { runService } from "@/lib/ai-router";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await runService({
      serviceId: "video-cine-lab",
      prompt: body.prompt || "Create a cinematic video",
      language: body.language,
      quality: body.quality || "balanced",
    });

    // Safely access output with fallback
    const outputText = result.output?.text || "";
    const outputFiles = result.output?.files || [];

    return NextResponse.json({
      success: result.success,
      output: { 
        type: "video" as const, 
        text: outputText, 
        files: outputFiles 
      },
      provider: result.meta?.provider || "unknown",
      error: result.error,
    });
  } catch (error) {
    console.error("Video Cine Lab error:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to generate video",
        output: { type: "video" as const, text: "", files: [] }
      },
      { status: 500 }
    );
  }
}
