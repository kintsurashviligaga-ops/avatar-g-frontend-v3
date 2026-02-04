"use client";

import { useState, useEffect } from "react";
import { Image as ImageIcon, Wand2 } from "lucide-react";
import { ToastProvider } from "@/components/Toast";
import ServiceHeader from "@/components/shared/ServiceHeader";
import ServiceIdentity from "@/components/shared/ServiceIdentity";
import ProjectSetup from "@/components/shared/ProjectSetup";
import AttachmentBar from "@/components/attachments/AttachmentBar";
import PresetsLibrary from "@/components/presets/PresetsLibrary";
import OutputPanel from "@/components/output/OutputPanel";
import HistoryPanel from "@/components/history/HistoryPanel";
import TemplateLibrary from "@/components/chat/TemplateLibrary";
import { useLanguage } from "@/components/LanguageProvider";
import { Attachment, JobRecord, Preset } from "@/lib/types/runtime";
import { createJob, runJob } from "@/lib/runtime/jobRunner";
import { loadHistory } from "@/lib/runtime/storage";
import { imageGeneratorTemplates } from "@/lib/templates/image-generator";

export default function ImageGeneratorPage() {
  const { language } = useLanguage();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("photorealistic");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [quality, setQuality] = useState("high");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [history, setHistory] = useState<JobRecord[]>([]);

  useEffect(() => {
    setHistory(loadHistory("image-generator"));
  }, []);

  const styles = [
    { id: "photorealistic", labelKa: "ფოტორეალისტური",   labelEn: "Photorealistic" },
    { id: "cinematic",      labelKa: "კინემატოგრაფიული", labelEn: "Cinematic" },
    { id: "product",        labelKa: "პროდუქტი",         labelEn: "Product" },
    { id: "illustration",   labelKa: "ილუსტრაცია",       labelEn: "Illustration" },
    { id: "noir",           labelKa: "ნუარი",            labelEn: "Noir" },
    { id: "retro",          labelKa: "რეტრო",            labelEn: "Retro" },
  ];

  const ratios = ["1:1", "4:5", "9:16", "16:9"];

  const defaultPresets: Preset[] = [
    {
      id: "preset-modern",
      serviceId: "image-generator",
      name: language === "ka" ? "თანამედროვე" : "Modern",
      params: { style: "photorealistic", aspectRatio: "16:9", quality: "high" },
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "preset-classic",
      serviceId: "image-generator",
      name: language === "ka" ? "კლასიკური" : "Classic",
      params: { style: "cinematic", aspectRatio: "4:5", quality: "high" },
      createdAt: "",
      updatedAt: "",
    },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    const params = { style, aspectRatio, quality };
    const job = createJob("image-generator", prompt, params, attachments);
    setCurrentJob(job);
    try {
      const result = await runJob(job);
      setCurrentJob(result);
      setHistory(loadHistory("image-generator"));
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleUseTemplate = (template: any) => {
    setPrompt(template.prompt);
    if (template.params) {
      if (template.params.style)       setStyle(template.params.style);
      if (template.params.aspectRatio) setAspectRatio(template.params.aspectRatio);
      if (template.params.quality)     setQuality(template.params.quality);
    }
  };

  const handleApplyPreset = (params: any) => {
    if (params.style)       setStyle(params.style);
    if (params.aspectRatio) setAspectRatio(params.aspectRatio);
    if (params.quality)     setQuality(params.quality);
  };

  const handleRerun = (job: JobRecord) => {
    setPrompt(job.prompt);
    if (job.params.style)       setStyle(job.params.style);
    if (job.params.aspectRatio) setAspectRatio(job.params.aspectRatio);
    if (job.params.quality)     setQuality(job.params.quality);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="სურათის გენერატორი"
          titleEn="Image Generator"
          subtitleKa="AI სურათების შექმნა"
          subtitleEn="AI Image Generation"
        />
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={ImageIcon}
            nameKa="სურათის გენერატორი"
            nameEn="Image Generator"
            descriptionKa="შექმნეთউნიკალური სურათები AI-ს დახმარებით"
            descriptionEn="Create unique images with AI assistance"
            purposeKa="პროფესიონალური ხარისხის სურთები ნებისმიერი მიზნისთვის"
            purposeEn="Professional quality images for any purpose"
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left */}
            <div className="space-y-6">
              <ProjectSetup serviceId="image-generator" />
              <TemplateLibrary
                serviceId="image-generator"
                templates={imageGeneratorTemplates}
                onUseTemplate={handleUseTemplate}
              />
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "პრომპტი" : "Prompt"}
                </h3>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={language === "ka" ? "აღწერეთ რა სურათი გსურთ..." : "Describe what image you want..."}
                  rows={4}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                />
              </div>
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "სტილი" : "Style"}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {styles.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={
                        "px-3 py-2 rounded-lg text-xs transition-all " +
                        (style === s.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")
                      }
                    >
                      {language === "ka" ? s.labelKa : s.labelEn}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "თანაფარდობა" : "Aspect Ratio"}
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {ratios.map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r)}
                      className={
                        "px-3 py-2 rounded-lg text-xs transition-all " +
                        (aspectRatio === r ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")
                      }
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <AttachmentBar
                serviceId="image-generator"
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />
              <PresetsLibrary
                serviceId="image-generator"
                currentParams={{ style, aspectRatio, quality }}
                onApplyPreset={handleApplyPreset}
                defaultPresets={defaultPresets}
              />
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || currentJob?.status === "running"}
                className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <Wand2 className="w-5 h-5" />
                {currentJob?.status === "running"
                  ? language === "ka" ? "გენერაცია..."   : "Generating..."
                  : language === "ka" ? "სურათის შექმნა" : "Generate Image"}
              </button>
            </div>
            {/* Middle */}
            <div>
              <OutputPanel
                output={currentJob?.output}
                isLoading={currentJob?.status === "running"}
              />
            </div>
            {/* Right */}
            <div>
              <HistoryPanel history={history} onRerun={handleRerun} />
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
        }
