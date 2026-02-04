"use client";

import { useState, useEffect } from "react";
import { FileText, Wand2 } from "lucide-react";
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
import { textIntelligenceTemplates } from "@/lib/templates/text-intelligence";

export default function TextIntelligencePage() {
  const { language } = useLanguage();
  const [task, setTask] = useState("rewrite");
  const [tone, setTone] = useState("professional");
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [history, setHistory] = useState<JobRecord[]>([]);

  useEffect(() => {
    setHistory(loadHistory("text-intelligence"));
  }, []);

  const tasks = [
    { id: "rewrite", labelKa: "გადაწერა", labelEn: "Rewrite" },
    { id: "summarize", labelKa: "შეჯამება", labelEn: "Summarize" },
    { id: "translate", labelKa: "თარგმნა", labelEn: "Translate" },
    { id: "ads", labelKa: "რეკლამა", labelEn: "Ads" },
    { id: "script", labelKa: "სკრიპტი", labelEn: "Script" },
  ];

  const tones = [
    { id: "professional", labelKa: "პროფესიონალური", labelEn: "Professional" },
    { id: "friendly", labelKa: "მეგობრული", labelEn: "Friendly" },
    { id: "formal", labelKa: "ფორმალური", labelEn: "Formal" },
    { id: "creative", labelKa: "კრეატიული", labelEn: "Creative" },
  ];

  const handleGenerate = async () => {
    if (!inputText.trim()) return;

    const prompt = "Task: " + task + ". Tone: " + tone + ". Input: " + inputText;
    const params = { task, tone };
    const job = createJob("text-intelligence", prompt, params, attachments);
    setCurrentJob(job);

    try {
      const result = await runJob(job);
      setCurrentJob(result);
      setHistory(loadHistory("text-intelligence"));
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleUseTemplate = (template: any) => {
    setInputText(template.prompt);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="ტექსტის ინტელექტი"
          titleEn="Text Intelligence"
          subtitleKa="პროფესიონალური წერა და ანალიზი"
          subtitleEn="Professional Writing & Analysis"
        />

        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={FileText}
            nameKa="ტექსტის ინტელექტი"
            nameEn="Text Intelligence"
            descriptionKa="AI-ით გაძლიერებული ტექსტის დამუშავება"
            descriptionEn="AI-powered text processing"
            purposeKa="დაწერეთ, გადაწერეთ, თარგმნეთ და გააანალიზეთ ტექსტები"
            purposeEn="Write, rewrite, translate, and analyze texts"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="text-intelligence" />

              <TemplateLibrary
                serviceId="text-intelligence"
                templates={textIntelligenceTemplates}
                onUseTemplate={handleUseTemplate}
              />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "დავალება" : "Task"}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {tasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTask(t.id)}
                      className={'px-3 py-2 rounded-lg text-xs transition-all ' + (task === t.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                    >
                      {language === "ka" ? t.labelKa : t.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "ტონი" : "Tone"}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {tones.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTone(t.id)}
                      className={'px-3 py-2 rounded-lg text-xs transition-all ' + (tone === t.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                    >
                      {language === "ka" ? t.labelKa : t.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "ტექსტი" : "Input Text"}
                </h3>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={language === "ka" ? "ჩაწერეთ ტექსტი..." : "Enter your text..."}
                  rows={8}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                />
                <p className="text-xs text-slate-400 text-right">
                  {inputText.length} {language === "ka" ? "სიმბოლო" : "characters"}
                </p>
              </div>

              <AttachmentBar
                serviceId="text-intelligence"
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />

              <button
                onClick={handleGenerate}
                disabled={!inputText.trim() || currentJob?.status === "running"}
                className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <Wand2 className="w-5 h-5" />
                {currentJob?.status === "running"
                  ? language === "ka"
                    ? "დამუშავება..."
                    : "Processing..."
                  : language === "ka"
                  ? "გენერაცია"
                  : "Generate"}
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
