"use client";

import { Clock } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

export default function HistoryLibrary() {
  const { language } = useLanguage();

  return (
    <div className="bg-white/5 border border-cyan-500/20 rounded-2xl p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-cyan-400">
          {language === "ka" ? "ისტორია" : "History"}
        </h3>
        <Clock className="w-4 h-4 text-slate-400" />
      </div>
      <div className="text-center py-8">
        <p className="text-sm text-slate-500">
          {language === "ka" ? "ისტორია ცარიელია" : "No history yet"}
        </p>
      </div>
    </div>
  );
}
