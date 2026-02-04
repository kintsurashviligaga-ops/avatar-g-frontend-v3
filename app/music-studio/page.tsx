"use client";

import { useState, useEffect } from "react";
import { Music, Wand2, Download } from "lucide-react";
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
import { musicStudioTemplates } from "@/lib/templates/music-studio";

export default function MusicStudioPage() {
  const { language } = useLanguage();
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("electronic");
  const [mood, setMood] = useState("energetic");
  const [bpm, setBpm] = useState(120);
  const [duration, setDuration] = useState(180);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [history, setHistory] = useState<JobRecord[]>([]);

  useEffect(() => {
    setHistory(loadHistory("music-studio"));
  }, []);

  const genres = [
    { id: "electronic", labelKa: "ელექტრონული", labelEn: "Electronic" },
    { id: "rock", labelKa: "როკი", labelEn: "Rock" },
    { id: "jazz", labelKa: "ჯაზი", labelEn: "Jazz" },
    { id: "classical", labelKa: "კლასიკური", labelEn: "Classical" },
    { id: "ambient", labelKa: "ემბიენტი", labelEn: "Ambient" },
    { id: "hiphop", labelKa: "ჰიპ-ჰოპი", labelEn: "Hip-Hop" },
  ];

  const moods = [
    { id: "energetic", labelKa: "ენერგიული", labelEn: "Energetic" },
    { id: "calm", labelKa: "მშვიდი", labelEn: "Calm" },
    { id: "dark", labelKa: "ბნელი", labelEn: "Dark" },
    { id: "happy", labelKa: "მხიარული", labelEn: "Happy" },
    { id: "melancholic", labelKa: "მელანქოლიური", labelEn: "Melancholic" },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    const params = { genre, mood, bpm, duration };
    const job = createJob("music-studio", prompt, params, attachments);
    setCurrentJob(job);

    try {
      const result = await runJob(job);
      setCurrentJob(result);
      setHistory(loadHistory("music-studio"));
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleUseTemplate = (template: any) => {
    setPrompt(template.prompt);
    if (template.params) {
      if (template.params.genre) setGenre(template.params.genre);
      if (template.params.bpm) setBpm(template.params.bpm);
      if (template.params.mood) setMood(template.params.mood);
    }
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="მუსიკის სტუდია"
          titleEn="Music Studio"
          subtitleKa="AI მუსიკის გენერაცია"
          subtitleEn="AI Music Generation"
        />

        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={Music}
            nameKa="მუსიკის სტუდია"
            nameEn="Music Studio"
            descriptionKa="შექმენით ორიგინალური მუსიკა AI-ს დახმარებით"
            descriptionEn="Create original music with AI assistance"
            purposeKa="გააკეთეთ სრული ტრეკები, ლუპები და საუნდტრეკები"
            purposeEn="Generate complete tracks, loops, and soundtracks"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="music-studio" />

              <TemplateLibrary
                serviceId="music-studio"
                templates={musicStudioTemplates}
                onUseTemplate={handleUseTemplate}
              />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "აღწერა" : "Description"}
                </h3>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={language === "ka" ? "აღწერეთ რა მუსიკა გსურთ..." : "Describe the music you want..."}
                  rows={4}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                />
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "ჟანრი" : "Genre"}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {genres.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setGenre(g.id)}
                      className={'px-3 py-2 rounded-lg text-xs transition-all ' + (genre === g.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                    >
                      {language === "ka" ? g.labelKa : g.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "განწყობა" : "Mood"}
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {moods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMood(m.id)}
                      className={'px-3 py-2 rounded-lg text-xs transition-all ' + (mood === m.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                    >
                      {language === "ka" ? m.labelKa : m.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "პარამეტრები" : "Parameters"}
                </h3>
                <ParameterSlider
                  labelKa="BPM (ტემპი)"
                  labelEn="BPM (Tempo)"
                  value={bpm}
                  onChange={setBpm}
                  min={60}
                  max={200}
                  step={5}
                />
                <ParameterSlider
                  labelKa="ხანგრძლივობა"
                  labelEn="Duration"
                  value={duration}
                  onChange={setDuration}
                  min={30}
                  max={300}
                  step={30}
                  unit="s"
                />
              </div>

              <AttachmentBar
                serviceId="music-studio"
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
                  ? "მუსიკის შექმნა"
                  : "Create Music"}
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
