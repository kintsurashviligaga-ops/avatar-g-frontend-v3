"use client";

import { useState, useEffect } from "react";
import { Briefcase, Wand2, Download } from "lucide-react";
import { ToastProvider } from "@/components/Toast";
import ServiceHeader from "@/components/shared/ServiceHeader";
import ServiceIdentity from "@/components/shared/ServiceIdentity";
import ProjectSetup from "@/components/shared/ProjectSetup";
import AttachmentBar from "@/components/attachments/AttachmentBar";
import OutputPanel from "@/components/output/OutputPanel";
import HistoryPanel from "@/components/history/HistoryPanel";
import TemplateLibrary from "@/components/chat/TemplateLibrary";
import { useLanguage } from "@/components/LanguageProvider";
import { Attachment, JobRecord } from "@/lib/types/runtime";
import { createJob, runJob } from "@/lib/runtime/jobRunner";
import { loadHistory } from "@/lib/runtime/storage";
import { businessAgentTemplates } from "@/lib/templates/business-agent";

export default function BusinessAgentPage() {
  const { language } = useLanguage();
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("startup");
  const [industry, setIndustry] = useState("tech");
  const [goal, setGoal] = useState("");
  const [budget, setBudget] = useState("10000");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [history, setHistory] = useState<JobRecord[]>([]);

  useEffect(() => {
    setHistory(loadHistory("business-agent"));
  }, []);

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

  const handleGenerate = async () => {
    if (!businessName.trim() || !goal.trim()) return;

    const prompt = "Business: " + businessName + ". Type: " + businessType + ". Industry: " + industry + ". Goal: " + goal + ". Budget: $" + budget;
    const params = { businessType, industry, budget };
    const job = createJob("business-agent", prompt, params, attachments);
    setCurrentJob(job);

    try {
      const result = await runJob(job);
      setCurrentJob(result);
      setHistory(loadHistory("business-agent"));
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleUseTemplate = (template: any) => {
    setGoal(template.prompt);
    if (template.params) {
      if (template.params.businessType) setBusinessType(template.params.businessType);
      if (template.params.market) setIndustry(template.params.market);
    }
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="business-agent" />

              <TemplateLibrary
                serviceId="business-agent"
                templates={businessAgentTemplates}
                onUseTemplate={handleUseTemplate}
              />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "ბიზნესის დეტალები" : "Business Details"}
                </h3>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ბიზნესის სახელი" : "Business Name"}
                    <span className="text-red-400 ml-1">*</span>
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
                        className={'px-3 py-2 rounded-lg text-xs transition-all ' + (businessType === t.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
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
                        className={'px-3 py-2 rounded-lg text-xs transition-all ' + (industry === i.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                      >
                        {language === "ka" ? i.labelKa : i.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "მიზანი" : "Goal"}
                    <span className="text-red-400 ml-1">*</span>
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

              <AttachmentBar
                serviceId="business-agent"
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />

              <button
                onClick={handleGenerate}
                disabled={!businessName.trim() || !goal.trim() || currentJob?.status === "running"}
                className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <Wand2 className="w-5 h-5" />
                {currentJob?.status === "running"
                  ? language === "ka"
                    ? "შექმნა..."
                    : "Creating..."
                  : language === "ka"
                  ? "გეგმის შექმნა"
                  : "Create Plan"}
              </button>
            </div>

            <div>
              <OutputPanel
                output={currentJob?.output}
                isLoading={currentJob?.status === "running"}
              />
            </div>

            <div>
              <HistoryPanel history={history} />
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
