"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Trash2, Eye, Play, Shield, Globe, Brain } from "lucide-react";
import { useRouter } from "next/navigation";
import { WarpBackground } from "@/components/WarpBackground";
import { GlassContainer } from "@/components/GlassContainer";
import { useSafeNavigation, useOnboarding } from "@/lib/navigation";
import { translations, Lang } from "@/lib/i18n";

export default function SettingsPage() {
  const router = useRouter();
  const { safeBack } = useSafeNavigation();
  const { reset } = useOnboarding();
  const [lang, setLang] = useState<Lang>("ge");
  const [settings, setSettings] = useState({
    projectMemory: true,
    preferenceMemory: true,
    tempChats: false,
  });
  
  const t = translations[lang];

  const handleLanguageChange = (newLang: Lang) => {
    setLang(newLang);
  };

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden relative">
      <WarpBackground />
      
      <div className="relative z-10 min-h-screen p-4 max-w-2xl mx-auto">
        {/* Header */}
        <header className="flex items-center gap-4 mb-6 pt-4">
          <button
            onClick={() => safeBack()}
            className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">{t.settings.title}</h1>
        </header>

        {/* Settings Groups */}
        <div className="space-y-4 pb-8">
          {/* Language */}
          <GlassContainer className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="w-5 h-5 text-cyan-400" />
              <h2 className="font-medium">{t.settings.language}</h2>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleLanguageChange("ge")}
                className={`flex-1 py-3 rounded-xl border transition-all ${
                  lang === "ge"
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                    : "bg-white/5 border-white/10 text-slate-400 hover:border-cyan-500/30"
                }`}
              >
                {t.settings.georgian}
              </button>
              <button
                onClick={() => handleLanguageChange("en")}
                className={`flex-1 py-3 rounded-xl border transition-all ${
                  lang === "en"
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                    : "bg-white/5 border-white/10 text-slate-400 hover:border-cyan-500/30"
                }`}
              >
                {t.settings.english}
              </button>
            </div>
          </GlassContainer>

          {/* Memory */}
          <GlassContainer className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Brain className="w-5 h-5 text-cyan-400" />
              <h2 className="font-medium">{t.settings.memory}</h2>
            </div>
            
            <div className="space-y-4">
              <Toggle
                label={t.settings.projectMemory}
                checked={settings.projectMemory}
                onChange={(v) => setSettings(s => ({ ...s, projectMemory: v }))}
              />
              <Toggle
                label={t.settings.preferenceMemory}
                checked={settings.preferenceMemory}
                onChange={(v) => setSettings(s => ({ ...s, preferenceMemory: v }))}
              />
              <Toggle
                label={t.settings.tempChats}
                checked={settings.tempChats}
                onChange={(v) => setSettings(s => ({ ...s, tempChats: v }))}
              />
            </div>

            <div className="flex gap-3 mt-6 pt-6 border-t border-white/10">
              <button
                onClick={() => router.push("/memory")}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors text-sm"
              >
                <Eye className="w-4 h-4" />
                {t.settings.viewMemory}
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors text-sm"
              >
                <Trash2 className="w-4 h-4" />
                {t.settings.clearMemory}
              </button>
            </div>
          </GlassContainer>

          {/* Privacy */}
          <GlassContainer className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="w-5 h-5 text-cyan-400" />
              <h2 className="font-medium">{t.settings.privacy}</h2>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">
              {t.settings.privacyText}
            </p>
            <div className="mt-4 flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Local memory ON
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                Cloud OFF
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                AI learning OFF
              </span>
            </div>
          </GlassContainer>

          {/* Replay Onboarding */}
          <GlassContainer className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium mb-1">{t.settings.replay}</h2>
                <p className="text-sm text-slate-500">
                  {lang === "ge" ? "გაიმეორეთ გაცნობითი ტური" : "Replay the introduction tour"}
                </p>
              </div>
              <button
                onClick={() => {
                  reset();
                  router.push("/onboarding");
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors"
              >
                <Play className="w-4 h-4" />
                {t.settings.showOnboarding}
              </button>
            </div>
          </GlassContainer>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-300">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          checked ? "bg-cyan-500" : "bg-white/10"
        }`}
      >
        <motion.div
          animate={{ x: checked ? 24 : 2 }}
          className="absolute top-1 w-4 h-4 rounded-full bg-white"
        />
      </button>
    </div>
  );
}
