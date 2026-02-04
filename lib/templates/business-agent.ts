import { ChatTemplate } from "@/lib/types/runtime";

export const businessAgentTemplates: ChatTemplate[] = [
  {
    id: "biz-georgia-local",
    serviceId: "business-agent",
    title: "Georgia Local Business Launch",
    desc: "Complete Georgian market entry plan",
    tags: ["georgia", "local", "startup"],
    prompt: "Create a complete business launch plan for the Georgian market. Include: Market analysis, target audience, pricing strategy (GEL), marketing channels (Georgian social media), launch timeline, budget breakdown.",
    params: { businessType: "startup", market: "Georgia" },
  },
  {
    id: "biz-upwork-profile",
    serviceId: "business-agent",
    title: "Upwork Profile + Pitch",
    desc: "Freelancer platform setup",
    tags: ["upwork", "freelance", "pitch"],
    prompt: "Create a complete Upwork/freelance profile and pitch package: Professional bio, service descriptions, pricing tiers, sample pitch messages for different client types, portfolio suggestions.",
    params: { businessType: "smb", market: "Global" },
  },
  {
    id: "biz-pricing-strategy",
    serviceId: "business-agent",
    title: "Pricing Strategy + Offers",
    desc: "Complete pricing framework",
    tags: ["pricing", "strategy", "offers"],
    prompt: "Develop a comprehensive pricing strategy: Market research, competitor analysis, 3 pricing tiers (basic, pro, premium), upsell opportunities, payment plans, discount strategy.",
    params: { businessType: "startup" },
  },
  {
    id: "biz-dm-templates",
    serviceId: "business-agent",
    title: "DM Outreach Templates",
    desc: "Social media outreach messages",
    tags: ["dm", "outreach", "social"],
    prompt: "Create 5 DM outreach templates for Instagram/Facebook: Cold outreach, warm follow-up, objection handling, closing, referral request. Each 50-100 words, conversational tone.",
  },
];
