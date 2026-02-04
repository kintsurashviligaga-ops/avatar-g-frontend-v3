import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { prompt, imageUrl } = await req.json();
    if (!prompt && !imageUrl) return NextResponse.json({ error: "Prompt or imageUrl required" }, { status: 400 });

    const response = await fetch("https://api.runwayml.com/v1/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
      },
      body: JSON.stringify({
        taskType: "gen2",
        text_prompt: prompt,
        image_prompt: imageUrl,
        duration: 4,
        motion: 5,
        seed: Math.floor(Math.random() * 1000000),
      }),
    });

    if (!response.ok) throw new Error("Runway API error");
    const data = await response.json();
    return NextResponse.json({ generationId: data.id, status: "pending", message: "ვიდეოს გენერაცია დაიწყო..." });
  } catch (error) {
    console.error("Video generator error:", error);
    return NextResponse.json({ error: "Failed to generate video" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const generationId = searchParams.get("id");
    if (!generationId) return NextResponse.json({ error: "Generation ID required" }, { status: 400 });

    const response = await fetch(`https://api.runwayml.com/v1/generations/${generationId}`, {
      headers: { "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}` },
    });

    if (!response.ok) throw new Error("Failed to check status");
    const data = await response.json();
    return NextResponse.json({ status: data.status, url: data.output?.[0]?.url, progress: data.progress || 0 });
  } catch (error) {
    console.error("Video status error:", error);
    return NextResponse.json({ error: "Failed to check status" }, { status: 500 });
  }
}
