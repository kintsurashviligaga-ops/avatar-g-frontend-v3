"use client";

import { useState, useEffect } from "react";
import { Gamepad2, Wand2 } from "lucide-react";
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
import { gameForgeTemplates } from "@/lib/templates/game-forge";

export default function GameForgePage() {
  const { language } = useLanguage();
  const [gameName, setGameName] = useState("");
  const [gameType, setGameType] = useState("2d");
  const [genre, setGenre] = useState("platformer");
  const [mechanics, setMechanics] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [currentJob, setCurrentJob] = useState<JobRecord | null>(null);
  const [history, setHistory] = useState<JobRecord[]>([]);

  useEffect(() => {
    setHistory(loadHistory("game-forge"));
  }, []);

  const gameTypes = [
    { id: "2d", labelKa: "2D", labelEn: "2D" },
    { id: "3d", labelKa: "3D", labelEn: "3D" },
    { id: "vr", labelKa: "VR", labelEn: "VR" },
  ];

  const genres = [
    { id: "platformer", labelKa: "პლატფორმერი", labelEn: "Platformer" },
    { id: "rpg", labelKa: "RPG", labelEn: "RPG" },
    { id: "fps", labelKa: "FPS", labelEn: "FPS" },
    { id: "puzzle", labelKa: "ფაზლი", labelEn: "Puzzle" },
    { id: "strategy", labelKa: "სტრატეგია", labelEn: "Strategy" },
  ];

  const handleGenerate = async () => {
    if (!gameName.trim()) return;

    const prompt = "Game: " + gameName + ". Type: " + gameType + ". Genre: " + genre + ". Mechanics: " + mechanics;
    const params = { gameType, genre, mechanics };
    const job = createJob("game-forge", prompt, params, attachments);
    setCurrentJob(job);

    try {
      const result = await runJob(job);
      setCurrentJob(result);
      setHistory(loadHistory("game-forge"));
    } catch (error) {
      console.error("Generation failed:", error);
    }
  };

  const handleUseTemplate = (template: any) => {
    setMechanics(template.prompt);
    if (template.params) {
      if (template.params.gameType) setGameType(template.params.gameType);
      if (template.params.genre) setGenre(template.params.genre);
    }
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader
          titleKa="თამაშის ფორჯი"
          titleEn="Game Forge"
          subtitleKa="თამაშის კონცეფციიდან პროდუქციამდე"
          subtitleEn="From Game Concept to Production"
        />

        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={Gamepad2}
            nameKa="თამაშის ფორჯი"
            nameEn="Game Forge"
            descriptionKa="შექმენით თამაშის სრული დიზაინის დოკუმენტი"
            descriptionEn="Create complete game design documents"
            purposeKa="კონცეფციიდან MVP-მდე ერთ ადგილას"
            purposeEn="From concept to MVP in one place"
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="game-forge" />

              <TemplateLibrary
                serviceId="game-forge"
                templates={gameForgeTemplates}
                onUseTemplate={handleUseTemplate}
              />

              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
                <h3 className="text-sm font-semibold text-cyan-400">
                  {language === "ka" ? "თამაშის კონფიგურაცია" : "Game Configuration"}
                </h3>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "თამაშის სახელი" : "Game Name"}
                    <span className="text-red-400 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    value={gameName}
                    onChange={(e) => setGameName(e.target.value)}
                    placeholder={language === "ka" ? "შეიყვანეთ სახელი..." : "Enter name..."}
                    className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ტიპი" : "Type"}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {gameTypes.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setGameType(t.id)}
                        className={'px-3 py-2 rounded-lg text-sm transition-all ' + (gameType === t.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
                      >
                        {language === "ka" ? t.labelKa : t.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "ჟანრი" : "Genre"}
                  </label>
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

                <div>
                  <label className="block text-sm text-slate-300 mb-2">
                    {language === "ka" ? "მთავარი მექანიკა" : "Core Mechanics"}
                  </label>
                  <textarea
                    value={mechanics}
                    onChange={(e) => setMechanics(e.target.value)}
                    placeholder={language === "ka" ? "აღწერეთ მექანიკა..." : "Describe mechanics..."}
                    rows={4}
                    className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500 resize-none"
                  />
                </div>
              </div>

              <AttachmentBar
                serviceId="game-forge"
                attachments={attachments}
                onAttachmentsChange={setAttachments}
              />

              <button
                onClick={handleGenerate}
                disabled={!gameName.trim() || currentJob?.status === "running"}
                className="w-full px-6 py-4 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
              >
                <Wand2 className="w-5 h-5" />
                {currentJob?.status === "running"
                  ? language === "ka"
                    ? "შექმნა..."
                    : "Creating..."
                  : language === "ka"
                  ? "დიზაინის შექმნა"
                  : "Create Design"}
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
