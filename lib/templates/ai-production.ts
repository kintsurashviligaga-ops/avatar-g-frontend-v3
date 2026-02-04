import { ChatTemplate } from "@/lib/types/runtime";

export const aiProductionTemplates: ChatTemplate[] = [
  {
    id: "prod-reels-factory",
    serviceId: "ai-production",
    title: "Reels Factory Workflow",
    desc: "Complete Reels production pipeline",
    tags: ["reels", "video", "workflow"],
    prompt: "Create a complete Reels production workflow: 1) Script generation, 2) Voice narration, 3) Video generation, 4) Music background, 5) Final assembly",
  },
  {
    id: "prod-content-package",
    serviceId: "ai-production",
    title: "Content Package Workflow",
    desc: "Multi-format content creation",
    tags: ["content", "multi", "package"],
    prompt: "Create a complete content package: 1) Blog post text, 2) Social media captions, 3) Image graphics, 4) Short video clip, 5) Email newsletter version",
  },
  {
    id: "prod-ad-campaign",
    serviceId: "ai-production",
    title: "Ad Campaign Workflow",
    desc: "Complete advertising campaign",
    tags: ["ads", "campaign", "marketing"],
    prompt: "Create a full ad campaign: 1) Target audience analysis, 2) Ad copy variants (3x), 3) Visual assets (5x), 4) Landing page copy, 5) Email sequence",
  },
  {
    id: "prod-brand-kit",
    serviceId: "ai-production",
    title: "Brand Kit Generator",
    desc: "Complete brand identity package",
    tags: ["brand", "identity", "design"],
    prompt: "Create a brand identity kit: 1) Brand strategy doc, 2) Color palette, 3) Logo concepts (3x), 4) Typography guide, 5) Brand voice guidelines",
  },
  {
    id: "prod-course-module",
    serviceId: "ai-production",
    title: "Course Module Creator",
    desc: "Educational content pipeline",
    tags: ["education", "course", "learning"],
    prompt: "Create a complete course module: 1) Lesson outline, 2) Script with timestamps, 3) Slide deck, 4) Voice narration, 5) Quiz questions (10x)",
  },
  {
    id: "prod-podcast-episode",
    serviceId: "ai-production",
    title: "Podcast Production",
    desc: "End-to-end podcast creation",
    tags: ["podcast", "audio", "production"],
    prompt: "Create a podcast episode: 1) Episode outline, 2) Script with guest questions, 3) Intro/outro music, 4) Voice generation, 5) Show notes + transcript",
  },
];
