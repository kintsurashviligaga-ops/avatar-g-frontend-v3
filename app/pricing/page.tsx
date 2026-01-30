"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Crown, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { WarpBackground } from "@/components/WarpBackground";
import { GlassContainer } from "@/components/GlassContainer";
import { useSafeNavigation } from "@/lib/navigation";
import { translations, Lang } from "@/lib/i18n";

export default function PricingPage() {
  const router = useRouter();
  const { safeBack } = useSafeNavigation();
  const [lang, setLang] = useState<Lang>("ge");
  
  const t = translations[lang];

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden relative">
      <WarpBackground />
      
      <div className="relative z-10 min-h-screen p-4 max-w-lg mx-auto flex flex-col">
        {/* Header */}
        <header className="flex items-center gap-4 mb-8 pt-4">
          <button
            onClick={() => safeBack()}
            className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-500/30 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setLang(lang === "ge" ? "en" : "ge")}
            className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 hover:border-cyan-500/30 transition-colors"
          >
            {lang === "ge" ? "EN" : "GE"}
          </button>
        </header>

        {/* Pricing Card */}
        <div className="flex-1 flex items-center justify-center">
          <GlassContainer className="w-full p-8 text-center" glow>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.1 }}
              className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-400/20 to-orange-600/20 border border-amber-500/30 flex items-center justify-center"
            >
              <Crown className="w-10 h-10 text-amber-400" />
            </motion.div>

            <h1 className="text-2xl font-bold mb-2 bg-gradient-to-r from-white to-amber-200 bg-clip-text text-transparent">
              {t.pricing.title}
            </h1>
            <p className="text-slate-400 mb-6">
              {t.pricing.subtitle}
            </p>

            <div className="mb-8">
              <span className="text-4xl font-bold text-white">2000₾</span>
              <span className="text-slate-500 ml-2">/ {lang === "ge" ? "წელი" : "year"}</span>
            </div>

            <div className="space-y-3 mb-8 text-left">
              {t.pricing.features.map((feature, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + idx * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center">
                    <Check className="w-3 h-3 text-cyan-400" />
                  </div>
                  <span className="text-sm text-slate-300">{feature}</span>
                </motion.div>
              ))}
            </div>

            <p className="text-xs text-slate-500 mb-6 italic">
              {t.pricing.trustLine}
            </p>

            <div className="space-y-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-shadow"
              >
                {t.activate}
              </motion.button>
              
              <button
                onClick={() => safeBack()}
                className="w-full py-3 text-slate-400 hover:text-white transition-colors text-sm"
              >
                {t.notNow}
              </button>
            </div>
          </GlassContainer>
        </div>

        {/* Trust Badge */}
        <div className="text-center pb-4">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-slate-500">
            <Sparkles className="w-3 h-3" />
            {lang === "ge" ? "30-დღიანი თანხის დაბრუნება" : "30-day money-back guarantee"}
          </div>
        </div>
      </div>
    </div>
  );
}
