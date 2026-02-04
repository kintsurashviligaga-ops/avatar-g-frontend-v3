#!/bin/bash

set -e

echo "🚀 AVATAR G - სრული რებილდი იწყება..."

# 1. საჭირო API-ების შენახვა
mkdir -p /tmp/backup-api
cp -r app/api/stt /tmp/backup-api/ 2>/dev/null || true
cp -r app/api/tts /tmp/backup-api/ 2>/dev/null || true
cp -r app/api/upload /tmp/backup-api/ 2>/dev/null || true

# 2. წაშლა და ახალი სტრუქტურა
rm -rf app/api/* components/* app/services/* app/page.tsx app/layout.tsx app/globals.css lib/* 2>/dev/null || true
mkdir -p app/api/{openrouter,gemini,groq,deepseek,xai,chatbot,tts,stt,image-generator,video-generator,music-generator,voice-lab,upload}
mkdir -p app/services/\[id\] components lib

# 3. აღდგენა
mv /tmp/backup-api/* app/api/ 2>/dev/null || true

echo "✅ სტრუქტურა მზადაა!"

# 4. ფაილების შექმნა
cat > app/layout.tsx << 'EOF'
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Avatar G - Georgian AI Content Platform",
  description: "პროფესიონალური AI ინსტრუმენტები ქართულ ენაზე",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka" className="dark">
      <body className={`${inter.className} antialiased`}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
EOF

cat > app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #05070A;
  --foreground: #ffffff;
}

body {
  @apply bg-[#05070A] text-white;
}

.text-gradient {
  @apply bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600;
}

.glass {
  @apply bg-white/5 backdrop-blur-xl border border-white/10;
}

.glass-hover {
  @apply hover:bg-white/10 hover:border-cyan-500/50 transition-all duration-300;
}
EOF

cat > app/page.tsx << 'EOF'
"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Sparkles, MessageSquare, Image, Music, Video, Wand2, Gamepad2, Briefcase, ChevronRight, Zap, Bot, ArrowRight } from "lucide-react";
import SpaceSingularityBackground from "@/components/SpaceSingularityBackground";
import Agent3D from "@/components/Agent3D";
import GlobalChatbot from "@/components/GlobalChatbot";
import ServiceCard from "@/components/ServiceCard";

const services = [
  { id: "text-intelligence", title: "ტექსტის ინტელექტი", description: "პროფესიონალური წერა და ანალიზი", icon: MessageSquare, color: "from-cyan-500 to-blue-500" },
  { id: "prompt-builder", title: "პრომპტის ბილდერი", description: "AI პრომპტების ოპტიმიზაცია", icon: Sparkles, color: "from-violet-500 to-purple-500" },
  { id: "image-generator", title: "სურათის გენერატორი", description: "AI სურათების შექმნა", icon: Image, color: "from-pink-500 to-rose-500" },
  { id: "image-architect", title: "სურათის არქიტექტორი", description: "დიზაინის სისტემები", icon: Wand2, color: "from-indigo-500 to-blue-600" },
  { id: "music-studio", title: "მუსიკის სტუდია", description: "AI მუსიკის შექმნა", icon: Music, color: "from-amber-500 to-orange-500" },
  { id: "voice-lab", title: "ხმის ლაბორატორია", description: "ხმის გენერაცია და კლონირება", icon: Bot, color: "from-emerald-500 to-teal-500" },
  { id: "video-generator", title: "ვიდეო გენერატორი", description: "AI ვიდეოების შექმნა", icon: Video, color: "from-red-500 to-pink-500" },
  { id: "video-cine-lab", title: "ვიდეო კინო ლაბი", description: "კინემატოგრაფიული პროდუქცია", icon: Video, color: "from-orange-500 to-red-500" },
  { id: "game-forge", title: "თამაშის ფორჯი", description: "თამაშის დიზაინი", icon: Gamepad2, color: "from-emerald-500 to-green-500" },
  { id: "ai-production", title: "AI პროდუქცია", description: "კონტენტის ქარხანა", icon: Zap, color: "from-yellow-500 to-amber-500" },
  { id: "business-agent", title: "ბიზნეს აგენტი", description: "ბიზნეს სტრატეგია", icon: Briefcase, color: "from-blue-500 to-indigo-500" },
];

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return <div className="min-h-screen bg-[#05070A] flex items-center justify-center"><div className="animate-pulse text-cyan-400">Loading...</div></div>;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070A]">
      <SpaceSingularityBackground />
      <Agent3D />
      <div className="relative z-10">
        <section className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 pt-20">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="text-center max-w-5xl mx-auto">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="mb-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-sm">
              <Sparkles className="w-4 h-4" /><span>AI სერვისების პლატფორმა</span>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.6 }} className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white mb-6 leading-tight">
              <span className="text-gradient">Avatar G</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }} className="text-xl sm:text-2xl md:text-3xl font-light text-gray-300 mb-4">შექმენი მომავალი AI-სთან ერთად</motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.6 }} className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">პროფესიონალური AI ინსტრუმენტები ქართულ ენაზე. ტექსტი, სურათები, ვიდეო, მუსიკა და სხვა.</motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5 }} className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={() => router.push("/services")} className="group px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-lg hover:from-cyan-400 hover:to-blue-500 transition-all transform hover:scale-105 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/25">
                <Sparkles className="w-5 h-5" />დაიწყე ახლა<ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button onClick={() => document.getElementById("services")?.scrollIntoView({ behavior: "smooth" })} className="px-8 py-4 rounded-xl border border-white/20 text-white font-semibold text-lg hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                ნახე სერვისები<ChevronRight className="w-5 h-5" />
              </button>
            </motion.div>
          </motion.div>
        </section>

        <section id="services" className="py-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">ყველა სერვისი</h2>
              <p className="text-gray-400 text-lg">აირჩიე სასურველი AI ინსტრუმენტი</p>
            </motion.div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {services.map((service, index) => <ServiceCard key={service.id} {...service} index={index} />)}
            </div>
          </div>
        </section>

        <footer className="py-12 px-4 border-t border-white/10">
          <div className="max-w-7xl mx-auto text-center">
            <p className="text-gray-500">© 2025 Avatar G. AI სერვისების პლატფორმა.</p>
          </div>
        </footer>
      </div>
      <GlobalChatbot />
    </div>
  );
}
EOF

echo "✅ app ფაილები შექმნილია"

