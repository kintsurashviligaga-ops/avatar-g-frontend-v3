"use client";

import React from "react";
import { motion } from "framer-motion";
import { Home, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { WarpBackground } from "@/components/WarpBackground";
import { GlassContainer } from "@/components/GlassContainer";
import { translations, Lang } from "@/lib/i18n";

export default function NotFound() {
  const router = useRouter();
  const [lang] = React.useState<Lang>("ge");
  const t = translations[lang];

  return (
    <div className="min-h-screen bg-[#05070A] text-white overflow-hidden relative">
      <WarpBackground />
      
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <GlassContainer className="max-w-md w-full p-8 text-center" glow>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring" }}
            className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center"
          >
            <AlertCircle className="w-10 h-10 text-red-400" />
          </motion.div>
          
          <h1 className="text-2xl font-bold mb-2">404</h1>
          <p className="text-slate-400 mb-8">
            {t.notFound.title}
          </p>
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.replace("/workspace")}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-shadow"
          >
            <Home className="w-5 h-5" />
            {t.notFound.return}
          </motion.button>
          
          <p className="mt-6 text-xs text-slate-600 font-mono">
            Invalid route: {typeof window !== "undefined" ? window.location.pathname : ""}
          </p>
        </GlassContainer>
      </div>
    </div>
  );
}
