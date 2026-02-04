"use client";

import { useState, useEffect } from "react";
import { Save, Upload } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

interface ProjectSetupProps {
  serviceId: string;
  onProjectChange?: (name: string, quality: string) => void;
}

export default function ProjectSetup({
  serviceId,
  onProjectChange,
}: ProjectSetupProps) {
  const [projectName, setProjectName] = useState("");
  const [quality, setQuality] = useState("pro");
  const { language } = useLanguage();

  const qualities = [
    { id: "standard", labelKa: "სტანდარტული", labelEn: "Standard" },
    { id: "pro", labelKa: "პრო", labelEn: "Pro" },
    { id: "ultra", labelKa: "ულტრა", labelEn: "Ultra" },
  ];

  useEffect(() => {
    const saved = localStorage.getItem(serviceId + "_draft");
    if (saved) {
      const data = JSON.parse(saved);
      setProjectName(data.projectName || "");
      setQuality(data.quality || "pro");
    }
  }, [serviceId]);

  useEffect(() => {
    const draft = { projectName, quality };
    localStorage.setItem(serviceId + "_draft", JSON.stringify(draft));
    if (onProjectChange) {
      onProjectChange(projectName, quality);
    }
  }, [projectName, quality, serviceId, onProjectChange]);

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl space-y-4">
      <h3 className="text-sm font-semibold text-cyan-400">
        {language === "ka" ? "პროექტის პარამეტრები" : "Project Setup"}
      </h3>

      <div>
        <label className="block text-sm text-slate-300 mb-2">
          {language === "ka" ? "პროექტის სახელი" : "Project Name"}
          <span className="text-red-400 ml-1">*</span>
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder={
            language === "ka" ? "ჩაწერეთ პროექტის სახელი..." : "Enter project name..."
          }
          className="w-full bg-white/5 border border-cyan-500/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder-slate-500"
        />
      </div>

      <div>
        <label className="block text-sm text-slate-300 mb-2">
          {language === "ka" ? "ხარისხის რეჟიმი" : "Quality Mode"}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {qualities.map((q) => (
            <button
              key={q.id}
              onClick={() => setQuality(q.id)}
              className={'px-4 py-2 rounded-lg text-sm font-medium transition-all ' + (quality === q.id ? "bg-cyan-500 text-white" : "bg-white/5 hover:bg-white/10 border border-cyan-500/20")}
            >
              {language === "ka" ? q.labelKa : q.labelEn}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm transition-colors">
          <Save className="w-4 h-4" />
          {language === "ka" ? "შენახვა" : "Save Preset"}
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-cyan-500/20 rounded-lg text-sm transition-colors">
          <Upload className="w-4 h-4" />
          {language === "ka" ? "ჩატვირთვა" : "Load Preset"}
        </button>
      </div>
    </div>
  );
}
