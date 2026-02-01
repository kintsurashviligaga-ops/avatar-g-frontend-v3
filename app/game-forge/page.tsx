"use client";

import { useState } from "react";
import { Gamepad2, Download } from "lucide-react";
import { ToastProvider } from "@/components/Toast";
import ServiceHeader from "@/components/shared/ServiceHeader";
import ServiceIdentity from "@/components/shared/ServiceIdentity";
import ProjectSetup from "@/components/shared/ProjectSetup";
import ActionControls from "@/components/shared/ActionControls";
import { useLanguage } from "@/components/LanguageProvider";

export default function GameForgePage() {
  const [gameName, setGameName] = useState("");
  const [genre, setGenre] = useState("platformer");
  const [mechanics, setMechanics] = useState("");
  const [gameDoc, setGameDoc] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { language } = useLanguage();

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setGameDoc(`# ${gameName} Game Design\n\nGenre: ${genre}\n\nCore Mechanics:\n${mechanics}\n\nMVP Features:\n1. Player movement\n2. Score system\n3. Level progression`);
      setIsGenerating(false);
    }, 2000);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#05070A] text-[#E5E7EB]">
        <ServiceHeader titleKa="თამაშის ფორჯი" titleEn="Game Forge" />
        <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
          <ServiceIdentity
            icon={Gamepad2}
            nameKa="თამაშის ფორჯი"
            nameEn="Game Forge"
            descriptionKa="შექმენით თამაშის დიზაინი"
            descriptionEn="Create game designs"
            purposeKa="კონცეფციიდან MVP-მდე"
            purposeEn="From concept to MVP"
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <ProjectSetup serviceId="game-forge" />
              <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 space-y-4">
                <input
                  type="text"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder={language === "ka" ? "თამაშის სახელი" : "Game name"}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none"
                />
                <textarea
                  value={mechanics}
                  onChange={(e) => setMechanics(e.target.value)}
                  placeholder={language === "ka" ? "მექანიკა..." : "Mechanics..."}
                  rows={4}
                  className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none resize-none"
                />
              </div>
              <ActionControls onPrimary={handleGenerate} isPrimaryDisabled={!gameName} isPrimaryLoading={isGenerating} />
            </div>
            <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6">
              <pre className="text-xs whitespace-pre-wrap">{gameDoc || (language === "ka" ? "დოკუმენტი..." : "Document...")}</pre>
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
