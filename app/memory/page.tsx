"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Search, Trash2, Download, Brain, Folder, Palette, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { WarpBackground } from "@/components/WarpBackground";
import { GlassContainer } from "@/components/GlassContainer";
import { useSafeNavigation } from "@/lib/navigation";
import { translations, Lang } from "@/lib/i18n";

const CATEGORIES = [
  { id: "preferences", icon: Palette, color: "from-pink-500 to-rose-500" },
  { id: "projects", icon: Folder, color: "from-cyan-500 to-blue-500" },
  { id: "style", icon: Brain, color: "from-violet-500 to-purple-500" },
  { id: "tools", icon: Wrench, color: "from-amber-500 to-orange-500" },
];

export default function MemoryPage() {
  const router = useRouter();
  const { safeBack } = useSafeNavigation();
  const [lang, setLang] = useState<Lang>("ge");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  
  const t = translations[lang];

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden relative">
      <WarpBackground />
      
      <div className="relative z-10 min-h-screen p-4 max-w-4xl mx-auto">
        {/* Header */}
        <header className="flex items-center gap-4 mb-6 pt-4">
          <button
            onClick={() => safeBack()}
            className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">{t.memory.title}</h1>
          <div className="flex-1" />
          <button
            onClick={() => setLang(lang === "ge" ? "en" : "ge")}
            className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 hover:border-cyan-500/30 transition-colors"
          >
            {lang === "ge" ? "EN" : "GE"}
          </button>
        </header>

        {/* Search */}
        <GlassContainer className="p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.memory.search}
              className="w-full bg-transparent pl-12 pr-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none"
            />
          </div>
        </GlassContainer>

        {/* Category Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setActiveCategory("all")}
            className={`px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-colors ${
              activeCategory === "all"
                ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                : "bg-white/5 border border-white/10 text-slate-400 hover:border-cyan-500/30"
            }`}
          >
            {lang === "ge" ? "ყველა" : "All"}
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-sm whitespace-nowrap transition-colors flex items-center gap-2 ${
                activeCategory === cat.id
                  ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                  : "bg-white/5 border border-white/10 text-slate-400 hover:border-cyan-500/30"
              }`}
            >
              <cat.icon className="w-4 h-4" />
              {/* @ts-ignore */}
              {t.memory[cat.id]}
            </button>
          ))}
        </div>

        {/* Memory Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Empty State */}
          <GlassContainer className="col-span-full p-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
              <Brain className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-500">{t.memory.empty}</p>
          </GlassContainer>
        </div>

        {/* Actions */}
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-3">
          <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors text-sm">
            <Download className="w-4 h-4" />
            {t.memory.export}
          </button>
          <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors text-sm">
            <Trash2 className="w-4 h-4" />
            {t.memory.delete}
          </button>
        </div>
      </div>
    </div>
  );
}
