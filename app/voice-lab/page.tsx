"use client";

import { useState, useEffect } from "react";
import { Mic, Wand2 } from "lucide-react";
import { ToastProvider } from "@/components/Toast";
import ServiceHeader from "@/components/shared/ServiceHeader";
import ServiceIdentity from "@/components/shared/ServiceIdentity";
import ProjectSetup from "@/components/shared/ProjectSetup";
import ParameterSlider from "@/components/shared/ParameterSlider";
import AttachmentBar from "@/components/attachments/AttachmentBar";
import OutputPanel from "@/components/output/OutputPanel";
import HistoryPanel from "@/components/history/HistoryPanel";
import TemplateLibrary from "@/components/chat/TemplateLibrary";
import { useLanguage } from "@/components/LanguageProvider";
import { Attachment, JobRecord } from "@/lib/types/runtime";
import { createJob, runJob } from "@/lib/runtime/jobRunner";
import { loadHistory } from "@/lib/runtime/storage";
import { voiceLabTemplates } from "@/lib/templates/voice-lab";

export default function VoiceLabPage() {
  const { language } = useLanguage();
  const [text, setText] = useState("");
  const [voiceStyle, setVoiceStyle] = useState("narrator");
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [history, setHistory] = useState<JobRecord[]>([]);

  useEffect(() => {
    setHistory(loadHistory("voice-lab"));
  }, []);

  const voiceStyles = [
    { id: "narrator", labelKa: "მთხრობელი", labelEn: "Narrator" },
    { id: "calm", labelKa: "მშვიდი", labelEn: "Calm" },
    { id: "energetic", labelKa: "ენერგიული", labelEn: "Energetic" },
  ];

  const handleGenerate = async () => {
    if (!text.trim()) return;

    const params = { voiceStyle, speed, pitch };
    const job = createJob("voice-lab", text, params, attachments);
    setCurrentJob(job);

    try {
      const result = await runJob(job);
      setCurrentJob(result);
      setHistory(loadHistory("voice-lab"));
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleUseTemplate = (template: any) => {
    setText(template.prompt);
    if (template.params) {
      if (template.params.style) setVoiceStyle(template.params.style);
      if (template.params.speed) setSpeed(template.params.speed);
      if (template.params.pitch) setPitch(template.params.pitch);
    }
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="ხმის ლაბორატორია"
          titleEn="Voice Lab"
          subtitleKa="ხმის გენერაცია და კლონირება"
          subtitleEn="Voice Generation & Cloning"
        />

        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={Mic}
            nameKa="ხმის ლაბორატორია"
            nameEn="Voice Lab"
            descriptionKa="შექმენით პროფესიონალური ხმოვანი შინაარსი"
            descriptionEn="Create professional voice content"
            purposeKa="ტექსტიდან ხმამდე, ხმის კლონირება და რედაქტირება"
            purposeEn="Text to speech, voice cloning, and editing"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="voice-lab" />

              <TemplateLibrary
                serviceId="voice-lab"
                templates={voiceLabTemplates}
                onUseTemplate={handleUseTemplate}
              />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "ტექსტი" : "Text"}
                </h3>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={language === "ka" ? "ჩაწერეთ ტექსტი რომელიც უნდა გახმოვანდეს..." : "Enter text to be spoken..."}
                  rows={6}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                />
                <div className="text-xs text-slate-400 text-right">
                  {text.length} {language === "ka" ? "სიმბოლო" : "characters"}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "ხმის სტილი" : "Voice Style"}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {voiceStyles.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => setVoiceStyle(style.id)}
                      className={'px-3 py-2 rounded-lg text-xs transition-all ' + (voiceStyle === style.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                    >
                      {language === "ka" ? style.labelKa : style.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400 mb-4">
                  {language === "ka" ? "პარამეტრები" : "Parameters"}
                </h3>
                <ParameterSlider
                  labelKa="სიჩქარე"
                  labelEn="Speed"
                  value={speed}
                  onChange={setSpeed}
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  unit="x"
                />
                <ParameterSlider
                  labelKa="ტონი"
                  labelEn="Pitch"
                  value={pitch}
                  onChange={setPitch}
                  min={-12}
                  max={12}
                  step={1}
                />
              </div>

              <AttachmentBar
                serviceId="voice-lab"
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />

              <button
                onClick={handleGenerate}
                disabled={!text.trim() || currentJob?.status === "running"}
                className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <Wand2 className="w-5 h-5" />
                {currentJob?.status === "running"
                  ? language === "ka"
                    ? "გენერაცია..."
                    : "Generating..."
                  : language === "ka"
                  ? "ხმის შექმნა"
                  : "Generate Voice"}
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
