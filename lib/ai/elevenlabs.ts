export async function generateVoice(text: string, voiceId: string, emotion: string = "neutral") {
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY!
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: emotion === "excited" ? 0.55 : 0.75,
          similarity_boost: emotion === "excited" ? 0.95 : 0.85
        }
      })
    });
    if (!response.ok) throw new Error(`Voice generation failed: ${response.status}`);
    const audioBuffer = await response.arrayBuffer();
    return { audioBuffer, duration: Math.ceil(text.length / 15), voiceId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Voice generation failed: ${message}`);
  }
}

export async function cloneVoice(audioFile: File, name: string) {
  try {
    const formData = new FormData();
    formData.append("name", name);
    formData.append("files", audioFile);
    const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      body: formData
    });
    if (!response.ok) throw new Error(`Voice cloning failed: ${response.status}`);
    const data = await response.json();
    return { voiceId: data.voice_id, name: data.name, samples: data.samples };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Voice cloning failed: ${message}`);
  }
}
