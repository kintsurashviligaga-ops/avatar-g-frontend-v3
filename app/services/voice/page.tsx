"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Mic, Play, Pause, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import SpaceBackground from "@/components/SpaceBackground";
import Header from "@/components/Header";

export default function VoiceServicePage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <Header />
      <section className="pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => router.push("/services")} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10">
              <ArrowLeft className="w-5 h-5 text-gray-300" />
            </motion.button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-400 flex items-center justify-center"><Mic className="w-5 h-5 text-white" /></div>
              <div><h1 className="text-xl font-bold text-white">ხმოვანი AI</h1><p className="text-sm text-gray-400">TTS, STT, ხმის კლონირება</p></div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Volume2 className="w-5 h-5 text-green-400" />ტექსტიდან ხმამდე</h2>
              <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="ჩაწერე ტექსტი რომ გადავაქციოთ ხმად..." rows={4} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 resize-none focus:outline-none focus:border-green-500/50 mb-4" />
              <div className="flex items-center gap-2">
                <select className="flex-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-gray-300 text-sm">
                  <option>ქართული - ნიკა</option>
                  <option>ქართული - თამარ</option>
                  <option>English - John</option>
                </select>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setIsPlaying(!isPlaying)} className="p-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl">
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </motion.button>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Mic className="w-5 h-5 text-emerald-400" />ხმიდან ტექსტამდე</h2>
              <div className="aspect-video rounded-xl bg-black/30 border border-white/10 flex items-center justify-center mb-4">
                <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setIsRecording(!isRecording)} className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${isRecording ? "bg-red-500 animate-pulse" : "bg-gradient-to-r from-green-500 to-emerald-500"}`}>
                  <Mic className="w-8 h-8 text-white" />
                </motion.button>
              </div>
              <p className="text-center text-gray-400 text-sm">{isRecording ? "მიდის ჩაწერა..." : "დააჭირე ჩასაწერად"}</p>
            </motion.div>
          </div>
        </div>
      </section>
    </main>
  );
}
