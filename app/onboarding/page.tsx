"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { WarpBackground } from "@/components/WarpBackground";
import { AgentOrb } from "@/components/AgentOrb";
import { GlassContainer } from "@/components/GlassContainer";
import { useOnboarding } from "@/lib/navigation";
import { translations, Lang } from "@/lib/i18n";

const SLIDES = [
  { id: 1, hasOrb: false },
  { id: 2, hasOrb: true },
  { id: 3, hasOrb: false },
  { id: 4, hasOrb: false },
  { id: 5, hasOrb: true },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { complete, isComplete } = useOnboarding();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [lang, setLang] = useState<Lang>("ge");
  const [direction, setDirection] = useState(0);
  
  const t = translations[lang];
  const slide = SLIDES[currentSlide];

  useEffect(() => {
    if (isComplete()) {
      router.replace("/workspace");
    }
  }, [router]);

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setDirection(1);
      setCurrentSlide((prev) => prev + 1);
    } else {
      complete();
      router.push("/workspace");
    }
  };

  const handleSkip = () => {
    complete();
    router.push("/workspace");
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      setDirection(-1);
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const getSlideContent = (slideId: number) => {
    const slideT = t.onboarding[`slide${slideId}` as keyof typeof t.onboarding];
    return slideT as { title: string; subtitle: string; cta?: string };
  };

  const content = getSlideContent(slide.id);

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden relative">
      <WarpBackground />
      
      <div className="relative z-10 h-screen flex flex-col p-6 max-w-2xl mx-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">Avatar G</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLang(lang === "ge" ? "en" : "ge")}
              className="text-xs text-slate-400 hover:text-cyan-300 transition-colors"
            >
              {lang === "ge" ? "EN" : "GE"}
            </button>
            {currentSlide < SLIDES.length - 1 && (
              <button
                onClick={handleSkip}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                {t.skip}
              </button>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-8">
          {SLIDES.map((_, idx) => (
            <div
              key={idx}
              className={`h-1 flex-1 rounded-full transition-colors ${
                idx <= currentSlide ? "bg-cyan-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* Slide Content */}
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentSlide}
              custom={direction}
              initial={{ opacity: 0, x: direction * 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -50 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full text-center"
            >
              <GlassContainer className="p-8 md:p-12" glow>
                {slide.hasOrb && (
                  <div className="flex justify-center mb-8">
                    <AgentOrb size="lg" pulse={slide.id === 2} />
                  </div>
                )}
                
                {!slide.hasOrb && slide.id === 1 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className="w-24 h-24 mx-auto mb-8 rounded-full bg-gradient-to-br from-cyan-400/30 to-blue-600/30 flex items-center justify-center border border-cyan-500/30"
                  >
                    <Sparkles className="w-10 h-10 text-cyan-300" />
                  </motion.div>
                )}

                <h2 className="text-2xl md:text-3xl font-bold mb-4 bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
                  {content.title}
                </h2>
                <p className="text-slate-400 text-lg mb-8">
                  {content.subtitle}
                </p>

                {slide.id === 5 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="space-y-3"
                  >
                    <button
                      onClick={handleNext}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-shadow"
                    >
                      {content.cta}
                    </button>
                    <button
                      onClick={handleSkip}
                      className="w-full py-3 text-slate-400 hover:text-white transition-colors text-sm"
                    >
                      {t.skip}
                    </button>
                  </motion.div>
                )}
              </GlassContainer>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        {currentSlide < SLIDES.length - 1 && (
          <div className="flex items-center justify-between mt-8">
            <button
              onClick={handleBack}
              disabled={currentSlide === 0}
              className={`p-3 rounded-xl border border-white/10 transition-colors ${
                currentSlide === 0 
                  ? "opacity-30 cursor-not-allowed" 
                  : "hover:border-cyan-500/30 hover:bg-white/5"
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium hover:shadow-lg hover:shadow-cyan-500/25 transition-shadow"
            >
              {t.next}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
