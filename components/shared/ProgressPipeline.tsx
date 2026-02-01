"use client";

import { Loader2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

interface ProgressPipelineProps {
  currentStage: number;
}

export default function ProgressPipeline({ currentStage }: ProgressPipelineProps) {
  const { language } = useLanguage();

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
      <h3 className="text-sm font-semibold text-cyan-400 mb-4">
        {language === "ka" ? "პროგრესი" : "Progress"}
      </h3>
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    </div>
  );
}
