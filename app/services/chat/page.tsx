"use client";

import { motion } from "framer-motion";
import { ArrowLeft, MessageSquare, Settings, History } from "lucide-react";
import { useRouter } from "next/navigation";
import SpaceBackground from "@/components/SpaceBackground";
import Header from "@/components/Header";
import ChatInterface from "@/components/ChatInterface";

export default function ChatServicePage() {
  const router = useRouter();
  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <Header />
      <section className="pt-24 pb-12 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-[calc(100vh-6rem)]">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => router.push("/services")} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                <ArrowLeft className="w-5 h-5 text-gray-300" />
              </motion.button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center"><MessageSquare className="w-5 h-5 text-white" /></div>
                <div><h1 className="text-xl font-bold text-white">AI ჩატბოტი</h1><p className="text-sm text-gray-400">GPT-4, Claude, Gemini</p></div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <motion.button whileHover={{ scale: 1.05 }} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10"><History className="w-5 h-5 text-gray-300" /></motion.button>
              <motion.button whileHover={{ scale: 1.05 }} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10"><Settings className="w-5 h-5 text-gray-300" /></motion.button>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="h-[calc(100%-5rem)]"><ChatInterface /></motion.div>
        </div>
      </section>
    </main>
  );
}
