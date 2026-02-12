export async function generateVideo(
  prompt: string,
  imageUrl?: string,
  duration: number = 4
) {
  try {
    const response = await fetch("https://api.runwayml.com/v1/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`
      },
      body: JSON.stringify({
        prompt,
        image_prompt: imageUrl,
        duration,
        ratio: "16:9",
        motion: 5
      })
    });

    if (!response.ok) {
      throw new Error(`Runway API error: ${response.status}`);
    }

    const data = await response.json();
    const videoUrl = await pollGenerationStatus(data.id);

    return {
      videoUrl,
      prompt,
      duration,
      id: data.id
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Runway error:", error);
    throw new Error(`Video generation failed: ${message}`);
  }
}

async function pollGenerationStatus(generationId: string): Promise<string> {
  const maxAttempts = 60;
  const delay = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `https://api.runwayml.com/v1/generations/${generationId}`,
      {
        headers: {
          "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`
        }
      }
    );

    const data = await response.json();

    if (data.status === "complete") {
      return data.output;
    }

    if (data.status === "failed") {
      throw new Error("Video generation failed");
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw new Error("Video generation timeout");
}
