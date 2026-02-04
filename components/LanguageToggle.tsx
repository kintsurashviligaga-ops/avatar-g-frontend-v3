"use client";

import { useLanguage } from "./LanguageProvider";

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-1 bg-white/5 border border-cyan-500/20 rounded-lg p-1">
      <button
        onClick={() => setLanguage("ka")}
        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
          language === "ka"
            ? "bg-cyan-500 text-white"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        KA
      </button>
      <button
        onClick={() => setLanguage("en")}
        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
          language === "en"
            ? "bg-cyan-500 text-white"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        EN
      </button>
    </div>
  );
}
