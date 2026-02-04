"use client";

import { useState, useEffect } from "react";
import { Factory, Wand2, CheckCircle2, Clock } from "lucide-react";
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
import { aiProductionTemplates } from "@/lib/templates/ai-production";

export default function AIProductionPage() {
  const { language } = useLanguage();
  const [workflowName, setWorkflowName] = useState("");
  const [workflowType, setWorkflowType] = useState("content");
  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [history, setHistory] = useState<JobRecord[]>([]);

  useEffect(() => {
    setHistory(loadHistory("ai-production"));
  }, []);

  const workflowTypes = [
    { id: "content", labelKa: "კონტენტი", labelEn: "Content" },
    { id: "marketing", labelKa: "მარკეტინგი", labelEn: "Marketing" },
    { id: "brand", labelKa: "ბრენდი", labelEn: "Brand" },
    { id: "education", labelKa: "განათლება", labelEn: "Education" },
  ];

  const addStep = () => {
    if (newStep.trim() && steps.length < 10) {
      setSteps([...steps, newStep.trim()]);
      setNewStep("");
    }
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (!workflowName.trim() || steps.length === 0) return;

    const prompt = "Workflow: " + workflowName + ". Type: " + workflowType + ". Steps: " + steps.join(", ");
    const params = { workflowType, steps };
    const job = createJob("ai-production", prompt, params, attachments);
    setCurrentJob(job);

    try {
      const result = await runJob(job);
      setCurrentJob(result);
      setHistory(loadHistory("ai-production"));
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleUseTemplate = (template: any) => {
    setWorkflowName(template.title);
    const templateSteps = template.prompt.split(/\d+\)/g).filter((s: string) => s.trim());
    setSteps(templateSteps.slice(1).map((s: string) => s.trim()));
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="AI პროდუქცია"
          titleEn="AI Production"
          subtitleKa="მულტი-სერვის ორკესტრაცია"
          subtitleEn="Multi-Service Orchestration"
        />

        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={Factory}
            nameKa="AI პროდუქცია"
            nameEn="AI Production"
            descriptionKa="ავტომატიზირებული workflow-ები რამდენიმე სერვისით"
            descriptionEn="Automated workflows across multiple services"
            purposeKa="შექმენით რთული პროდუქციული pipeline-ები"
            purposeEn="Create complex production pipelines"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="ai-production" />

              <TemplateLibrary
                serviceId="ai-production"
                templates={aiProductionTemplates}
                onUseTemplate={handleUseTemplate}
              />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "Workflow კონფიგურაცია" : "Workflow Configuration"}
                </h3>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "Workflow სახელი" : "Workflow Name"}
                    <span className="text-red-400 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder={language === "ka" ? "შეიყვანეთ სახელი..." : "Enter name..."}
                    className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ტიპი" : "Type"}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {workflowTypes.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setWorkflowType(t.id)}
                        className={'px-3 py-2 rounded-lg text-xs transition-all ' + (workflowType === t.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                      >
                        {language === "ka" ? t.labelKa : t.labelEn}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-cyan-400">
                    {language === "ka" ? "Pipeline ნაბიჯები" : "Pipeline Steps"}
                  </h3>
                  <span className="text-xs text-slate-400">
                    {steps.length}/10
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newStep}
                    onChange={(e) => setNewStep(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && addStep()}
                    placeholder={language === "ka" ? "დაამატეთ ნაბიჯი..." : "Add step..."}
                    className="flex-1 bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
                  />
                  <button
                    onClick={addStep}
                    disabled={!newStep.trim() || steps.length >= 10}
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-sm transition-colors"
                  >
                    +
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {steps.map((step, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 bg-white/5 border border-cyan-500/20 rounded-lg group"
                    >
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-semibold flex-shrink-0">
                        {index + 1}
                      </div>
                      <span className="flex-1 text-sm">{step}</span>
                      <button
                        onClick={() => removeStep(index)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-400 transition-all text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {steps.length === 0 && (
                  <div className="text-center py-8 text-sm text-slate-500">
                    {language === "ka" ? "დაამატეთ ნაბიჯები workflow-სთვის" : "Add steps to your workflow"}
                  </div>
                )}
              </div>

              <AttachmentBar
                serviceId="ai-production"
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />

              <button
                onClick={handleGenerate}
                disabled={!workflowName.trim() || steps.length === 0 || currentJob?.status === "running"}
                className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <Wand2 className="w-5 h-5" />
                {currentJob?.status === "running"
                  ? language === "ka"
                    ? "გაშვება..."
                    : "Running..."
                  : language === "ka"
                  ? "Pipeline-ის გაშვება"
                  : "Run Pipeline"}
              </button>
            </div>

            <div className="space-y-6">
              <OutputPanel
                output={currentJob?.output}
                isLoading={currentJob?.status === "running"}
              />

              {currentJob?.status === "running" && (
                <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                  <h3 className="text-sm font-semibold text-cyan-400 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 animate-spin" />
                    {language === "ka" ? "Pipeline მიმდინარეობს" : "Pipeline Progress"}
                  </h3>
                  <div className="space-y-3">
                    {steps.map((step, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-slate-300">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
