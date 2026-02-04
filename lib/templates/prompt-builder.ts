import { ChatTemplate } from "@/lib/types/runtime";

export const promptBuilderTemplates: ChatTemplate[] = [
  {
    id: "prompt-image-photo",
    serviceId: "prompt-builder",
    title: "Photorealistic Image Prompt",
    desc: "Professional photo-style prompts",
    tags: ["image", "photo", "realistic"],
    prompt: "Build a photorealistic image generation prompt with these elements: Subject, Setting, Lighting, Camera angle, Style, Quality modifiers",
  },
  {
    id: "prompt-video-cinematic",
    serviceId: "prompt-builder",
    title: "Cinematic Video Prompt",
    desc: "Movie-style video prompts",
    tags: ["video", "cinematic", "film"],
    prompt: "Build a cinematic video generation prompt with: Scene description, Camera movement, Lighting, Mood, Pacing, Style references",
  },
  {
    id: "prompt-business-plan",
    serviceId: "prompt-builder",
    title: "Business Plan Prompt",
    desc: "Structured business prompts",
    tags: ["business", "plan", "strategy"],
    prompt: "Build a business strategy prompt with: Industry, Goals, Market, Constraints, Output format (sections required)",
  },
];
