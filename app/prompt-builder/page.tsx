"use client";

import { useState, useEffect } from "react";
import { Sparkles, Copy } from "lucide-react";
import { ToastProvider } from "@/components/Toast";
import ServiceHeader from "@/components/shared/ServiceHeader";
import ServiceIdentity from "@/components/shared/ServiceIdentity";
import ProjectSetup from "@/components/shared/ProjectSetup";
import HistoryPanel from "@/components/history/HistoryPanel";
import TemplateLibrary from "@/components/chat/TemplateLibrary";
import { useLanguage } from "@/components/LanguageProvider";
import { JobRecord } from "@/lib/types/runtime";
import { loadHistory } from "@/lib/runtime/storage";
import { promptBuilderTemplates } from "@/lib/templates/prompt-builder";

export default function PromptBuilderPage() {
  const { language } = useLanguage();
  const [prompt, setPrompt] = useState("");
  const [targetModel, setTargetModel] = useState("midjourney");
  const [style, setStyle] = useState("photorealistic");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [history, setHistory] = useState<JobRecord[]>([]);

  useEffect(() => {
    setHistory(loadHistory("prompt-builder"));
  }, []);

  const models = ["midjourney", "dall-e-3", "stable-diffusion", "leonardo"];
  const styles = ["photorealistic", "anime", "digital-art", "oil-painting"];
  const ratios = ["1:1", "16:9", "9:16", "4:3"];

  const handleGenerate = () => {
    const enhanced =
      "Enhanced prompt: " +
      prompt +
      ", ultra detailed, " +
      style +
      " style, professional photography --ar " +
      aspectRatio;
    setGeneratedPrompt(enhanced);
  };

  const handleUseTemplate = (template: any) => {
    setPrompt(template.prompt);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="პრომპტის ბილდერი"
          titleEn="Prompt Builder"
          subtitleKa="პროფესიონალური AI პრომპტების შექმნა"
          subtitleEn="Professional AI Prompt Engineering"
        />

        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={Sparkles}
            nameKa="პრომპტის ბილდერი"
            nameEn="Prompt Builder"
            descriptionKa="შექმენით პროფესიონალური AI პრომპტები"
            descriptionEn="Create professional AI prompts"
            purposeKa="გააუმჯობესეთ თქვენი პრომპტები შედეგების გასაუმჯობესებლად"
            purposeEn="Enhance your prompts for better results"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="prompt-builder" />

              <TemplateLibrary
                serviceId="prompt-builder"
                templates={promptBuilderTemplates}
                onUseTemplate={handleUseTemplate}
              />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "კონფიგურაცია" : "Configuration"}
                </h3>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ძირითადი პრომპტი" : "Base Prompt"}
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={
                      language === "ka"
                        ? "აღწერეთ რა გსურთ..."
                        : "Describe what you want..."
                    }
                    rows={4}
                    className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "მოდელი" : "Target Model"}
                  </label>
                  <select
                    value={targetModel}
                    onChange={(e) => setTargetModel(e.target.value)}
                    className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "სტილი" : "Style"}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {styles.map((s) => (
                      <button
                        key={s}
                        onClick={() => setStyle(s)}
                        className={
                          "px-3 py-2 rounded-lg text-xs transition-all " +
                          (style === s
                            ? "bg-cyan-500 text-white"
                            : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")
                        }
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "თანაფარდობა" : "Aspect Ratio"}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {ratios.map((r) => (
                      <button
                        key={r}
                        onClick={() => setAspectRatio(r)}
                        className={
                          "px-3 py-2 rounded-lg text-xs transition-all " +
                          (aspectRatio === r
                            ? "bg-cyan-500 text-white"
                            : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")
                        }
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25"
              >
                {language === "ka" ? "პრომპტის შექმნა" : "Build Prompt"}
              </button>
            </div>

            <div className="space-y-6">
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-cyan-400">
                    {language === "ka"
                      ? "გენერირებული პრომპტი"
                      : "Generated Prompt"}
                  </h3>
                  {generatedPrompt && (
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(generatedPrompt)
                      }
                      className="p-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg transition-colors"
                    >
                      <Copy className="w-4 h-4 text-cyan-400" />
                    </button>
                  )}
                </div>
                <div className="min-h-[200px] bg-[#05070A] rounded-lg p-4">
                  {generatedPrompt ? (
                    <p className="text-sm leading-relaxed">{generatedPrompt}</p>
                  ) : (
                    <p className="text-sm text-slate-500">
                      {language === "ka"
                        ? "პრომპტი გამოჩნდება აქ..."
                        : "Prompt will appear here..."}
                    </p>
                  )}
                </div>
              </div>

              <HistoryPanel history={history} />
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
