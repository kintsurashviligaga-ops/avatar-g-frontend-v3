import { ChatTemplate } from "@/lib/types/runtime";

export const videoGeneratorTemplates: ChatTemplate[] = [
  {
    id: "vid-tiktok-ad",
    serviceId: "video-generator",
    title: "9:16 TikTok Ad (10s)",
    desc: "Quick vertical video ad",
    tags: ["tiktok", "ad", "vertical"],
    prompt: "Create a 10-second vertical video for TikTok/Reels. Fast-paced, attention-grabbing opening, clear product showcase, strong call to action.",
    params: { duration: 10, aspectRatio: "9:16", motionIntensity: 4 },
  },
  {
    id: "vid-trailer-cinematic",
    serviceId: "video-generator",
    title: "Cinematic Trailer (15s)",
    desc: "Movie-style dramatic trailer",
    tags: ["trailer", "cinematic", "dramatic"],
    prompt: "Create a 15-second cinematic trailer with dramatic music, slow-motion shots, and powerful visuals. Build tension and excitement.",
    params: { duration: 15, aspectRatio: "16:9", motionIntensity: 3 },
  },
  {
    id: "vid-product-demo",
    serviceId: "video-generator",
    title: "Product Demo (10s)",
    desc: "Quick product demonstration",
    tags: ["product", "demo", "commercial"],
    prompt: "Create a 10-second product demonstration video. Show key features, benefits, and usage. Professional and clear.",
    params: { duration: 10, aspectRatio: "16:9", motionIntensity: 2 },
  },
  {
    id: "vid-explainer-simple",
    serviceId: "video-generator",
    title: "Simple Explainer (15s)",
    desc: "Educational walkthrough",
    tags: ["explainer", "educational", "tutorial"],
    prompt: "Create a 15-second simple explainer video. Step-by-step visuals, clean design, easy to follow. Educational tone.",
    params: { duration: 15, aspectRatio: "16:9", motionIntensity: 2 },
  },
];
