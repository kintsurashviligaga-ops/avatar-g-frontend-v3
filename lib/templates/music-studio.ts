import { ChatTemplate } from "@/lib/types/runtime";

export const musicStudioTemplates: ChatTemplate[] = [
  {
    id: "music-georgian-folk",
    serviceId: "music-studio",
    title: "Georgian Folk Modern",
    desc: "Traditional + modern fusion",
    tags: ["georgian", "folk", "fusion"],
    prompt: "Create a modern Georgian folk music track. Blend traditional Georgian polyphonic singing style with contemporary production. Include traditional instruments.",
    params: { genre: "ambient", bpm: 90, mood: "melancholic" },
  },
  {
    id: "music-ad-upbeat",
    serviceId: "music-studio",
    title: "Upbeat Ad Music",
    desc: "Commercial background track",
    tags: ["ad", "upbeat", "commercial"],
    prompt: "Create upbeat, positive background music for commercial/ad. 30-60 seconds, catchy melody, no vocals, energetic but not overwhelming.",
    params: { genre: "electronic", bpm: 128, mood: "energetic" },
  },
  {
    id: "music-lo-fi-chill",
    serviceId: "music-studio",
    title: "Lo-fi Study Beats",
    desc: "Relaxing background music",
    tags: ["lofi", "chill", "study"],
    prompt: "Create lo-fi hip-hop style music for studying/working. Relaxed tempo, warm analog sounds, subtle beats, no vocals.",
    params: { genre: "ambient", bpm: 85, mood: "calm" },
  },
];
