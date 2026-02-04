import { ChatTemplate } from "@/lib/types/runtime";

export const textIntelligenceTemplates: ChatTemplate[] = [
  {
    id: "text-rewrite-premium-ka",
    serviceId: "text-intelligence",
    title: "Rewrite Premium Georgian",
    desc: "Convert to premium Georgian style",
    tags: ["rewrite", "georgian", "premium"],
    prompt: "Rewrite the following text in premium, professional Georgian language style. Maintain the meaning but elevate the tone and vocabulary.",
  },
  {
    id: "text-ad-variants",
    serviceId: "text-intelligence",
    title: "3 Ad Variants",
    desc: "Create 3 different ad versions",
    tags: ["ads", "marketing", "variants"],
    prompt: "Create 3 different advertising copy variants for the following product/service. Each variant should have a different tone: 1) Professional, 2) Friendly, 3) Urgent. Keep each under 100 words.",
  },
  {
    id: "text-reels-script",
    serviceId: "text-intelligence",
    title: "Short Script for Reels",
    desc: "15-30 second social media script",
    tags: ["script", "reels", "social"],
    prompt: "Write a 15-30 second script for Instagram Reels/TikTok about the following topic. Include: Hook (first 3 seconds), Main content, Call to action. Use conversational tone.",
  },
  {
    id: "text-email-sequence",
    serviceId: "text-intelligence",
    title: "Email Welcome Sequence",
    desc: "3-email welcome series",
    tags: ["email", "sequence", "marketing"],
    prompt: "Create a 3-email welcome sequence for new subscribers. Email 1: Welcome + value proposition. Email 2: Social proof + benefits. Email 3: Call to action. Each 150-200 words.",
  },
  {
    id: "text-landing-copy",
    serviceId: "text-intelligence",
    title: "Landing Page Copy",
    desc: "Complete landing page structure",
    tags: ["landing", "conversion", "sales"],
    prompt: "Write complete landing page copy with these sections: Hero headline + subheadline, Problem statement, Solution, Features (3), Benefits (3), Social proof placeholder, CTA. Professional and persuasive tone.",
  },
];
