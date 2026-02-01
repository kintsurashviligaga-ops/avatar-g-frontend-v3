"use client";

import { useState } from "react";
import { Music, Download, Play } from "lucide-react";
import { ToastProvider } from "@/components/Toast";
import ServiceHeader from "@/components/shared/ServiceHeader";
import ServiceIdentity from "@/components/shared/ServiceIdentity";
import ProjectSetup from "@/components/shared/ProjectSetup";
import ParameterSlider from "@/components/shared/ParameterSlider";
import ActionControls from "@/components/shared/ActionControls";
import OutputDisplay from "@/components/shared/OutputDisplay";
import AttachmentBar from "@/components/shared/AttachmentBar";
import HistoryLibrary from "@/components/shared/HistoryLibrary";
import { useLanguage } from "@/components/LanguageProvider";

export default function MusicStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("electronic");
  const [mood, setMood] = useState("energetic");
  const [bpm, setBpm] = useState(120);
  const [duration, setDuration] = useState(180);
  const [generatedMusic, setGeneratedMusic] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { language } = useLanguage();

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

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setGeneratedMusic("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3");
      setIsGenerating(false);
    }, 3000);
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

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "მუსიკის აღწერა" : "Music Description"}
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
                      className={`px-3 py-2 rounded-lg text-xs transition-all ${
                        genre === g.id
                          ? "bg-cyan-500 text-white"
                          : "bg-white/5 hover:bg-white/10 border border-cyan-500/20"
                      }`}
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
                      className={`px-3 py-2 rounded-lg text-xs transition-all ${
                        mood === m.id
                          ? "bg-cyan-500 text-white"
                          : "bg-white/5 hover:bg-white/10 border border-cyan-500/20"
                      }`}
                    >
                      {language === "ka" ? m.labelKa : m.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400 mb-4">
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

              <AttachmentBar acceptTypes={["audio"]} />

              <ActionControls
                onPrimary={handleGenerate}
                isPrimaryDisabled={!prompt.trim()}
                isPrimaryLoading={isGenerating}
              />
            </div>

            <div className="space-y-6">
              <OutputDisplay type="audio" content={generatedMusic} isLoading={isGenerating} />

              {generatedMusic && !isGenerating && (
                <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                  <h3 className="text-sm font-semibold text-cyan-400 mb-4">
                    {language === "ka" ? "ექსპორტი" : "Export"}
                  </h3>
                  <div className="space-y-2">
                    <button className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm flex items-center justify-center gap-2">
                      <Download className="w-4 h-4" />
                      MP3 (320kbps)
                    </button>
                    <button className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm flex items-center justify-center gap-2">
                      <Download className="w-4 h-4" />
                      WAV (Lossless)
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <HistoryLibrary serviceId="music-studio" />
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
