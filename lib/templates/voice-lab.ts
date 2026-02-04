import { ChatTemplate } from "@/lib/types/runtime";

export const voiceLabTemplates: ChatTemplate[] = [
  {
    id: "voice-narrator-ka",
    serviceId: "voice-lab",
    title: "Georgian Narration",
    desc: "Documentary-style Georgian voice",
    tags: ["georgian", "narration", "documentary"],
    prompt: "Create a professional Georgian language narration in a calm, authoritative documentary style. The voice should be clear and engaging.",
    params: { style: "narrator", speed: 1.0, pitch: 0 },
  },
  {
    id: "voice-ad-energetic",
    serviceId: "voice-lab",
    title: "Energetic Ad Voice",
    desc: "High-energy commercial voice",
    tags: ["ad", "energetic", "commercial"],
    prompt: "Create an energetic, upbeat commercial voice. Fast-paced, enthusiastic, perfect for radio or social media ads.",
    params: { style: "energetic", speed: 1.2, pitch: 0 },
  },
  {
    id: "voice-explainer-calm",
    serviceId: "voice-lab",
    title: "Calm Explainer",
    desc: "Soothing educational voice",
    tags: ["explainer", "calm", "educational"],
    prompt: "Create a calm, friendly explainer voice. Perfect for tutorials, educational content, or meditation guides. Slow and clear.",
    params: { style: "calm", speed: 0.9, pitch: 0 },
  },
  {
    id: "voice-character-dramatic",
    serviceId: "voice-lab",
    title: "Dramatic Character",
    desc: "Theatrical character voice",
    tags: ["character", "dramatic", "theatrical"],
    prompt: "Create a dramatic, theatrical character voice with emotional range. Suitable for storytelling, audiobooks, or character dialogue.",
    params: { style: "narrator", speed: 1.0, pitch: 0 },
  },
];
