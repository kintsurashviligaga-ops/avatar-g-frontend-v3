"use client";

import { useState } from "react";
import { Briefcase, Download } from "lucide-react";
import { ToastProvider } from "@/components/Toast";
import ServiceHeader from "@/components/shared/ServiceHeader";
import ServiceIdentity from "@/components/shared/ServiceIdentity";
import ProjectSetup from "@/components/shared/ProjectSetup";
import ActionControls from "@/components/shared/ActionControls";
import { useLanguage } from "@/components/LanguageProvider";

export default function BusinessAgentPage() {
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("startup");
  const [industry, setIndustry] = useState("tech");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("10000");
  const [businessPlan, setBusinessPlan] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { language } = useLanguage();

  const businessTypes = [
    { id: "startup", labelKa: "სტარტაპი", labelEn: "Startup" },
    { id: "smb", labelKa: "მცირე ბიზნესი", labelEn: "Small Business" },
    { id: "enterprise", labelKa: "კორპორაცია", labelEn: "Enterprise" },
  ];

  const industries = [
    { id: "tech", labelKa: "ტექნოლოგია", labelEn: "Technology" },
    { id: "retail", labelKa: "ვაჭრობა", labelEn: "Retail" },
    { id: "services", labelKa: "სერვისები", labelEn: "Services" },
    { id: "manufacturing", labelKa: "წარმოება", labelEn: "Manufacturing" },
  ];

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setBusinessPlan(\`# \${businessName || "Business"} Strategy Plan

## Executive Summary
Type: \${businessType}
Industry: \${industry}
Budget: $\${budget}

## Business Goal
\${goal || "Achieve market leadership"}

## Market Analysis
- Target Market: Young professionals
- Competitive Landscape: Growing market
- Market Size: $10M annually

## Revenue Model
- Pricing: Premium tier
- Sales Channels: Direct + Partners
- Projected Revenue: Year 1: $500K

## Marketing Strategy
- Digital Marketing: SEO, Social Media
- Content Marketing: Blog, Videos
- Partnerships: Strategic alliances

## Financial Projections
Year 1: Break-even
Year 2: 20% profit margin
Year 3: Scale operations

## Action Plan
1. Product Development (3 months)
2. Beta Launch (1 month)
3. Marketing Campaign (ongoing)
4. Scale team (6 months)
\`);
      setIsGenerating(false);
    }, 3000);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="ბიზნეს აგენტი"
          titleEn="Business Agent"
          subtitleKa="AI ბიზნეს სტრატეგი"
          subtitleEn="AI Business Strategist"
        />

        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={Briefcase}
            nameKa="ბიზნეს აგენტი"
            nameEn="Business Agent"
            descriptionKa="შექმენით ბიზნეს გეგმა და სტრატეგია AI-ს დახმარებით"
            descriptionEn="Create business plans and strategies with AI"
            purposeKa="სრული ბიზნეს პლანი, ფინანსები და მარკეტინგი"
            purposeEn="Complete business plan, financials, and marketing"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="business-agent" />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "ბიზნესის დეტალები" : "Business Details"}
                </h3>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ბიზნესის სახელი" : "Business Name"}
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder={language === "ka" ? "შეიყვანეთ სახელი..." : "Enter name..."}
                    className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ტიპი" : "Type"}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {businessTypes.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setBusinessType(t.id)}
                        className={`px-3 py-2 rounded-lg text-xs transition-all ${
                          businessType === t.id
                            ? "bg-cyan-500 text-white"
                            : "bg-white/5 hover:bg-white/10 border border-cyan-500/20"
                        }`}
                      >
                        {language === "ka" ? t.labelKa : t.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ინდუსტრია" : "Industry"}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {industries.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => setIndustry(i.id)}
                        className={`px-3 py-2 rounded-lg text-xs transition-all ${
                          industry === i.id
                            ? "bg-cyan-500 text-white"
                            : "bg-white/5 hover:bg-white/10 border border-cyan-500/20"
                        }`}
                      >
                        {language === "ka" ? i.labelKa : i.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "მიზანი" : "Goal"}
                  </label>
                  <textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder={language === "ka" ? "აღწერეთ მიზანი..." : "Describe goal..."}
                    rows={3}
                    className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ბიუჯეტი ($)" : "Budget ($)"}
                  </label>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="10000"
                    className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
                  />
                </div>
              </div>

              <ActionControls
                onPrimary={handleGenerate}
                isPrimaryDisabled={!businessName.trim() || !goal.trim()}
                isPrimaryLoading={isGenerating}
              />
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-cyan-400">
                    {language === "ka" ? "ბიზნეს გეგმა" : "Business Plan"}
                  </h3>
                  {businessPlan && (
                    <button className="p-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg">
                      <Download className="w-4 h-4 text-cyan-400" />
                    </button>
                  )}
                </div>
                <div className="min-h-[500px] max-h-[600px] overflow-y-auto bg-[#05070A] rounded-lg p-4">
                  {businessPlan ? (
                    <pre className="text-xs whitespace-pre-wrap font-mono">{businessPlan}</pre>
                  ) : (
                    <p className="text-sm text-slate-500">
                      {language === "ka"
                        ? "გეგმა გამოჩნდება აქ..."
                        : "Plan will appear here..."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
