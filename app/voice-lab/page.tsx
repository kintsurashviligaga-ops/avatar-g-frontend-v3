"use client";

import { useState } from "react";
import { ToastProvider } from "@/components/Toast";
import { Mic, Play, Pause, Download, AudioLines, Upload } from "lucide-react";
import ChatWindow from "@/components/shared/ChatWindow";
import ParameterSlider from "@/components/shared/ParameterSlider";
import FileUploadZone from "@/components/shared/FileUploadZone";
import OutputDisplay from "@/components/shared/OutputDisplay";
import { useLanguage } from "@/components/LanguageProvider";
import { useSafeBack } from "@/lib/navigation";
import LanguageToggle from "@/components/LanguageToggle";

export default function VoiceLabPage() {
  const [text, setText] = useState("");
  const [voiceModel, setVoiceModel] = useState("female-ka-1");
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const [stability, setStability] = useState(0.75);
  const [emotion, setEmotion] = useState("neutral");
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSamples, setVoiceSamples] = useState<File[]>([]);
  const [mode, setMode] = useState<"tts" | "clone">("tts");

  const { language } = useLanguage();
  const safeBack = useSafeBack();

  const voices = [
    { id: "female-ka-1", nameKa: "ქალი - ნინო", nameEn: "Female - Nino", lang: "ka" },
    { id: "male-ka-1", nameKa: "კაცი - გიორგი", nameEn: "Male - Giorgi", lang: "ka" },
    { id: "female-en-1", nameKa: "ქალი - ემილი", nameEn: "Female - Emily", lang: "en" },
    { id: "male-en-1", nameKa: "კაცი - ჯონ", nameEn: "Male - John", lang: "en" },
  ];

  const emotions = [
    { id: "neutral", labelKa: "ნეიტრალური", labelEn: "Neutral" },
    { id: "happy", labelKa: "მხიარული", labelEn: "Happy" },
    { id: "sad", labelKa: "სევდიანი", labelEn: "Sad" },
    { id: "angry", labelKa: "გაბრაზებული", labelEn: "Angry" },
    { id: "excited", labelKa: "აღელვებული", labelEn: "Excited" },
  ];

  const handleGenerate = () => {
    if (!text.trim() && voiceSamples.length === 0) return;

    setIsGenerating(true);

    setTimeout(() => {
      setGeneratedAudio("https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3");
      setIsGenerating(false);
    }, 3000);
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <header className="border-b border-cyan-500/20 bg-white/5 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <button onClick={safeBack} className="text-cyan-400 hover:text-cyan-300 text-sm">
              ← {language === "ka" ? "უკან" : "Back"}
            </button>
            <h1 className="text-lg font-semibold">
              {language === "ka" ? "ხმის ლაბორატორია" : "Voice Lab"}
            </h1>
            <LanguageToggle />
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex justify-center mb-6">
            <div className="inline-flex bg-white/5 border border-cyan-500/20 rounded-lg p-1">
              <button
                onClick={() => setMode("tts")}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                  mode === "tts"
                    ? "bg-cyan-500 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {language === "ka" ? "ტექსტი → ხმა" : "Text to Speech"}
              </button>
              <button
                onClick={() => setMode("clone")}
                className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${
                  mode === "clone"
                    ? "bg-cyan-500 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {language === "ka" ? "ხმის კლონირება" : "Voice Cloning"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                <h3 className="text-sm font-semibold text-cyan-400 mb-4">
                  {language === "ka" ? "ტექსტი" : "Text"}
                </h3>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    language === "ka"
                      ? "ჩაწერეთ ტექსტი რომელიც უნდა გახმოვანდეს..."
                      : "Enter text to be spoken..."
                  }
                  rows={6}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                />
                <div className="mt-2 text-xs text-slate-400 text-right">
                  {text.length} {language === "ka" ? "სიმბოლო" : "characters"}
                </div>
              </div>

              {mode === "tts" ? (
                <>
                  <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                    <h3 className="text-sm font-semibold text-cyan-400 mb-4">
                      {language === "ka" ? "ხმა" : "Voice"}
                    </h3>
                    <div className="space-y-2">
                      {voices.map((voice) => (
                        <button
                          key={voice.id}
                          onClick={() => setVoiceModel(voice.id)}
                          className={`w-full px-4 py-3 rounded-lg text-sm transition-all flex items-center justify-between ${
                            voiceModel === voice.id
                              ? "bg-cyan-500 text-white"
                              : "bg-white/5 hover:bg-white/10 border border-cyan-500/20"
                          }`}
                        >
                          <span>{language === "ka" ? voice.nameKa : voice.nameEn}</span>
                          <span className="text-xs opacity-70">
                            {voice.lang.toUpperCase()}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                    <h3 className="text-sm font-semibold text-cyan-400 mb-4">
                      {language === "ka" ? "ემოცია" : "Emotion"}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {emotions.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setEmotion(e.id)}
                          className={`px-3 py-2 rounded-lg text-xs transition-all ${
                            emotion === e.id
                              ? "bg-cyan-500 text-white"
                              : "bg-white/5 hover:bg-white/10 border border-cyan-500/20"
                          }`}
                        >
                          {language === "ka" ? e.labelKa : e.labelEn}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                    <h3 className="text-sm font-semibold text-cyan-400 mb-4">
                      {language === "ka" ? "ხმის ნიმუშები" : "Voice Samples"}
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">
                      {language === "ka"
                        ? "ატვირთეთ 3-5 აუდიო ფაილი (თითო 10+ წამი)"
                        : "Upload 3-5 audio files (10+ seconds each)"}
                    </p>
                    <FileUploadZone
                      accept="audio/*"
                      maxFiles={5}
                      onFilesSelected={setVoiceSamples}
                      labelKa="აუდიოს ატვირთვა"
                      labelEn="Upload Audio"
                    />
                  </div>

                  <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                    <h3 className="text-sm font-semibold text-cyan-400 mb-4">
                      {language === "ka" ? "ან ჩაწერეთ" : "Or Record"}
                    </h3>
                    <button
                      onClick={toggleRecording}
                      className={`w-full px-6 py-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                        isRecording
                          ? "bg-red-500 hover:bg-red-400 text-white"
                          : "bg-cyan-500 hover:bg-cyan-400 text-white"
                      }`}
                    >
                      <Mic className="w-5 h-5" />
                      {isRecording
                        ? language === "ka"
                          ? "შეჩერება"
                          : "Stop Recording"
                        : language === "ka"
                        ? "ჩაწერის დაწყება"
                        : "Start Recording"}
                    </button>
                  </div>
                </>
              )}

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
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  unit="x"
                />

                <ParameterSlider
                  labelKa="სტაბილურობა"
                  labelEn="Stability"
                  value={stability}
                  onChange={setStability}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={!text.trim() || isGenerating}
                className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <AudioLines className="w-5 h-5" />
                {isGenerating
                  ? language === "ka"
                    ? "გენერაცია..."
                    : "Generating..."
                  : language === "ka"
                  ? "ხმის შექმნა"
                  : "Generate Voice"}
              </button>
            </div>

            <div className="lg:col-span-1">
              <OutputDisplay
                type="audio"
                content={generatedAudio}
                isLoading={isGenerating}
              />

              {generatedAudio && !isGenerating && (
                <div className="mt-6 bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
                  <h3 className="text-sm font-semibold text-cyan-400 mb-4">
                    {language === "ka" ? "ტალღის ფორმა" : "Waveform"}
                  </h3>
                  <div className="h-32 bg-[#05070A] rounded-lg flex items-center justify-center">
                    <div className="flex items-end gap-1 h-20">
                      {Array.from({ length: 50 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-cyan-500/50 rounded-full animate-pulse"
                          style={{
                            height: `${Math.random() * 100}%`,
                            animationDelay: `${i * 50}ms`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl backdrop-blur-xl h-[600px]">
                <div className="p-4 border-b border-cyan-500/10">
                  <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
                    <Mic className="w-4 h-4" />
                    {language === "ka" ? "ხმის ასისტენტი" : "Voice Assistant"}
                  </h3>
                </div>
                <ChatWindow
                  serviceName="Voice Lab"
                  placeholder={
                    language === "ka"
                      ? "ჰკითხეთ ხმის შესახებ..."
                      : "Ask about voice generation..."
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
