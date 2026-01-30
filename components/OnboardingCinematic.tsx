"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AgentPresence3D from "./AgentPresence3D";

interface OnboardingCinematicProps {
  onComplete: () => void;
}

const scenes = [
  {
    id: 1,
    titleKa: "შენი AI სივრცე",
    titleEn: "Your AI Space",
    subtitleKa: "პრემიუმ ტექნოლოგია, პროფესიონალური კონტროლი",
    subtitleEn: "Premium technology, professional control",
  },
  {
    id: 2,
    titleKa: "გაიცანი Agent G",
    titleEn: "Meet Agent G",
    subtitleKa: "შენი პერსონალური AI ასისტენტი",
    subtitleEn: "Your personal AI assistant",
    showAgent: true,
  },
  {
    id: 3,
    titleKa: "ყველაფერი ერთ სივრცეში",
    titleEn: "Everything in one workspace",
    subtitleKa: "13 AI სერვისი ერთ ჩათში",
    subtitleEn: "13 AI services in one chat",
    showServices: true,
  },
  {
    id: 4,
    titleKa: "შენი კონტროლი. შენი მონაცემები.",
    titleEn: "Your control. Your data.",
    subtitleKa: "პრივატულობა უპირატესობაა",
    subtitleEn: "Privacy is priority",
  },
];

export default function OnboardingCinematic({ onComplete }: OnboardingCinematicProps) {
  const [currentScene, setCurrentScene] = useState(0);
  const [language, setLanguage] = useState<"ka" | "en">("ka");

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentScene((prev) => {
        if (prev >= scenes.length - 1) {
          setTimeout(onComplete, 1000);
          return prev;
        }
        return prev + 1;
      });
    }, 3500);

    return () => clearInterval(timer);
  }, [onComplete]);

  const scene = scenes[currentScene];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070A]">
      {/* Background stars */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            initial={{
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1000),
              opacity: 0,
            }}
            animate={{
              opacity: [0, Math.random() * 0.8 + 0.2, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: Math.random() * 3 + 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={scene.id}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 text-center px-6 max-w-md"
        >
          {/* Agent for scene 2 */}
          {scene.showAgent && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mb-8 flex justify-center"
            >
              <AgentPresence3D size={120} />
            </motion.div>
          )}

          {/* Service icons for scene 3 */}
          {scene.showServices && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mb-8 flex justify-center gap-3 flex-wrap"
            >
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 backdrop-blur-sm"
                />
              ))}
            </motion.div>
          )}

          {/* Text content */}
          <motion.h1
            className="text-3xl sm:text-4xl font-light text-white mb-4 tracking-tight"
            style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
          >
            {language === "ka" ? scene.titleKa : scene.titleEn}
          </motion.h1>
          
          <motion.p
            className="text-sm text-gray-400 font-light"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {language === "ka" ? scene.subtitleKa : scene.subtitleEn}
          </motion.p>

          {/* Language toggle */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={() => setLanguage(language === "ka" ? "en" : "ka")}
            className="mt-8 text-xs text-gray-500 hover:text-cyan-400 transition-colors uppercase tracking-widest"
          >
            {language === "ka" ? "English" : "ქართული"}
          </motion.button>
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex gap-2">
        {scenes.map((_, i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full"
            animate={{
              backgroundColor: i === currentScene ? "#22D3EE" : "rgba(255,255,255,0.2)",
              scale: i === currentScene ? 1.2 : 1,
            }}
            transition={{ duration: 0.3 }}
          />
        ))}
      </div>

      {/* Skip button */}
      <button
        onClick={onComplete}
        className="absolute top-6 right-6 text-xs text-gray-500 hover:text-white transition-colors"
      >
        Skip
      </button>
    </div>
  );
}
