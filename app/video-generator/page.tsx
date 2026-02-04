"use client";

import { useState, useEffect } from "react";
import { Video, Wand2 } from "lucide-react";
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
import { videoGeneratorTemplates } from "@/lib/templates/video-generator";

export default function VideoGeneratorPage() {
  const { language } = useLanguage();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(10);
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [style, setStyle] = useState("cinematic");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [history, setHistory] = useState<JobRecord[]>([]);

  useEffect(() => {
    setHistory(loadHistory("video-generator"));
  }, []);

  const durations = [5, 10, 15, 30];
  const ratios = ["9:16", "16:9", "1:1"];
  const styles = [
    { id: "cinematic", labelKa: "კინემატოგრაფიული", labelEn: "Cinematic" },
    { id: "modern", labelKa: "თანამედროვე", labelEn: "Modern" },
    { id: "creative", labelKa: "კრეატიული", labelEn: "Creative" },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    const params = { duration, aspectRatio, style };
    const job = createJob("video-generator", prompt, params, attachments);
    setCurrentJob(job);

    try {
      const result = await runJob(job);
      setCurrentJob(result);
      setHistory(loadHistory("video-generator"));
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleUseTemplate = (template: any) => {
    setPrompt(template.prompt);
    if (template.params) {
      if (template.params.duration) setDuration(template.params.duration);
      if (template.params.aspectRatio) setAspectRatio(template.params.aspectRatio);
    }
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="ვიდეო გენერატორი"
          titleEn="Video Generator"
          subtitleKa="AI ვიდეოების შექმნა"
          subtitleEn="AI Video Generation"
        />

        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={Video}
            nameKa="ვიდეო გენერატორი"
            nameEn="Video Generator"
            descriptionKa="შექმენით პროფესიონალური ვიდეოები AI-ს დახმარებით"
            descriptionEn="Create professional videos with AI assistance"
            purposeKa="ტექსტიდან ვიდეომდე რამდენიმე წამში"
            purposeEn="From text to video in seconds"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="video-generator" />

              <TemplateLibrary
                serviceId="video-generator"
                templates={videoGeneratorTemplates}
                onUseTemplate={handleUseTemplate}
              />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "პრომპტი" : "Prompt"}
                </h3>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={language === "ka" ? "აღწერეთ რა ვიდეო გსურთ..." : "Describe what video you want..."}
                  rows={4}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                />
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "ხანგრძლივობა" : "Duration"}
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {durations.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={'px-3 py-2 rounded-lg text-xs transition-all ' + (duration === d ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "თანაფარდობა" : "Aspect Ratio"}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {ratios.map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r)}
                      className={'px-3 py-2 rounded-lg text-xs transition-all ' + (aspectRatio === r ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "სტილი" : "Style"}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {styles.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={'px-3 py-2 rounded-lg text-xs transition-all ' + (style === s.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                    >
                      {language === "ka" ? s.labelKa : s.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <AttachmentBar
                serviceId="video-generator"
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />

              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || currentJob?.status === "running"}
                className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <Wand2 className="w-5 h-5" />
                {currentJob?.status === "running"
                  ? language === "ka"
                    ? "შექმნა..."
                    : "Creating..."
                  : language === "ka"
                  ? "ვიდეოს შექმნა"
                  : "Generate Video"}
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
