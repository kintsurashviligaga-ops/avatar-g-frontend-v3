"use client";

import { useState } from "react";
import { Film, Plus, Trash2 } from "lucide-react";
import { ToastProvider } from "@/components/Toast";
import ServiceHeader from "@/components/shared/ServiceHeader";
import ServiceIdentity from "@/components/shared/ServiceIdentity";
import ProjectSetup from "@/components/shared/ProjectSetup";
import ActionControls from "@/components/shared/ActionControls";
import OutputDisplay from "@/components/shared/OutputDisplay";
import { useLanguage } from "@/components/LanguageProvider";

interface Scene {
  id: string;
  prompt: string;
  shotType: string;
  duration: number;
}

export default function VideoCineLabPage() {
  const [scenes, setScenes] = useState<Scene[]>([
    { id: "1", prompt: "", shotType: "medium", duration: 5 },
  ]);
  const [lighting, setLighting] = useState("natural");
  const [mood, setMood] = useState("cinematic");
  const [colorGrade, setColorGrade] = useState("neutral");
  const [generatedVideo, setGeneratedVideo] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { language } = useLanguage();

  const shotTypes = [
    { id: "wide", labelKa: "ფართო", labelEn: "Wide" },
    { id: "medium", labelKa: "საშუალო", labelEn: "Medium" },
    { id: "close", labelKa: "ახლო", labelEn: "Close-up" },
    { id: "pov", labelKa: "POV", labelEn: "POV" },
  ];

  const lightingOptions = [
    { id: "natural", labelKa: "ბუნებრივი", labelEn: "Natural" },
    { id: "dramatic", labelKa: "დრამატული", labelEn: "Dramatic" },
    { id: "soft", labelKa: "რბილი", labelEn: "Soft" },
    { id: "neon", labelKa: "ნეონი", labelEn: "Neon" },
  ];

  const colorGrades = [
    { id: "neutral", labelKa: "ნეიტრალური", labelEn: "Neutral" },
    { id: "warm", labelKa: "თბილი", labelEn: "Warm" },
    { id: "cool", labelKa: "ცივი", labelEn: "Cool" },
    { id: "vintage", labelKa: "ვინტაჯი", labelEn: "Vintage" },
  ];

  const addScene = () => {
    setScenes([
      ...scenes,
      { id: Date.now().toString(), prompt: "", shotType: "medium", duration: 5 },
    ]);
  };

  const removeScene = (id: string) => {
    setScenes(scenes.filter((s) => s.id !== id));
  };

  const updateScene = (id: string, field: string, value: any) => {
    setScenes(scenes.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setGeneratedVideo("https://www.w3schools.com/html/mov_bbb.mp4");
      setIsGenerating(false);
    }, 5000);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="ვიდეო კინო ლაბი"
          titleEn="Video Cine Lab"
          subtitleKa="კინემატოგრაფიული პროდუქცია"
          subtitleEn="Cinematic Production Studio"
        />

        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={Film}
            nameKa="ვიდეო კინო ლაბი"
            nameEn="Video Cine Lab"
            descriptionKa="შექმენით კინემატოგრაფიული ხარისხის ვიდეო"
            descriptionEn="Create cinematic quality videos"
            purposeKa="მრავალსცენიანი სტორიბორდი და პროფესიონალური პროდუქცია"
            purposeEn="Multi-scene storyboards and professional production"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <ProjectSetup serviceId="video-cine-lab" />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-cyan-400">
                    {language === "ka" ? "სცენები" : "Scenes"}
                  </h3>
                  <button
                    onClick={addScene}
                    className="flex items-center gap-2 px-3 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    {language === "ka" ? "დამატება" : "Add Scene"}
                  </button>
                </div>

                <div className="space-y-4">
                  {scenes.map((scene, index) => (
                    <div
                      key={scene.id}
                      className="bg-white/5 border border-cyan-500/20 rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {language === "ka" ? "სცენა" : "Scene"} {index + 1}
                        </span>
                        {scenes.length > 1 && (
                          <button
                            onClick={() => removeScene(scene.id)}
                            className="p-1 hover:bg-red-500/20 rounded text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <textarea
                        value={scene.prompt}
                        onChange={(e) =>
                          updateScene(scene.id, "prompt", e.target.value)
                        }
                        placeholder={
                          language === "ka"
                            ? "აღწერეთ სცენა..."
                            : "Describe the scene..."
                        }
                        rows={3}
                        className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            {language === "ka" ? "კადრი" : "Shot Type"}
                          </label>
                          <select
                            value={scene.shotType}
                            onChange={(e) =>
                              updateScene(scene.id, "shotType", e.target.value)
                            }
                            className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none"
                          >
                            {shotTypes.map((s) => (
                              <option key={s.id} value={s.id}>
                                {language === "ka" ? s.labelKa : s.labelEn}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-400 mb-1">
                            {language === "ka" ? "ხანგრძლივობა" : "Duration"}
                          </label>
                          <input
                            type="number"
                            value={scene.duration}
                            onChange={(e) =>
                              updateScene(
                                scene.id,
                                "duration",
                                Number(e.target.value)
                              )
                            }
                            min={1}
                            max={30}
                            className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "სინათლე და სტილი" : "Lighting & Style"}
                </h3>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "განათება" : "Lighting"}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {lightingOptions.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setLighting(l.id)}
                        className={`px-3 py-2 rounded-lg text-xs transition-all ${
                          lighting === l.id
                            ? "bg-cyan-500 text-white"
                            : "bg-white/5 hover:bg-white/10 border border-cyan-500/20"
                        }`}
                      >
                        {language === "ka" ? l.labelKa : l.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ფერის გრადაცია" : "Color Grade"}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {colorGrades.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setColorGrade(c.id)}
                        className={`px-3 py-2 rounded-lg text-xs transition-all ${
                          colorGrade === c.id
                            ? "bg-cyan-500 text-white"
                            : "bg-white/5 hover:bg-white/10 border border-cyan-500/20"
                        }`}
                      >
                        {language === "ka" ? c.labelKa : c.labelEn}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <ActionControls
                onPrimary={handleGenerate}
                isPrimaryDisabled={scenes.some((s) => !s.prompt.trim())}
                isPrimaryLoading={isGenerating}
              />
            </div>

            <div className="space-y-6">
              <OutputDisplay
                type="video"
                content={generatedVideo}
                isLoading={isGenerating}
              />
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
