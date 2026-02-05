"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Image as ImageIcon, Wand2, Download, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import SpaceBackground from "@/components/SpaceBackground";
import Header from "@/components/Header";

export default function ImageServicePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 3000);
  };

  return (
    <main className="relative min-h-screen">
      <SpaceBackground />
      <Header />
      <section className="pt-24 pb-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-8">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => router.push("/services")} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10">
              <ArrowLeft className="w-5 h-5 text-gray-300" />
            </motion.button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-white" /></div>
              <div><h1 className="text-xl font-bold text-white">სურათის გენერატორი</h1><p className="text-sm text-gray-400">DALL-E, Midjourney, Stable Diffusion</p></div>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-1 space-y-4">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                <label className="block text-sm font-medium text-gray-300 mb-2">აღწერე შენი სურათი</label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="მაგ: ფუტურისტული ქალაქი მთვარეზე..." rows={6} className="w-full px-4 py-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-500 resize-none focus:outline-none focus:border-purple-500/50" />
                <div className="mt-4 space-y-3">
                  <div>
                    <label className="text-xs text-gray-400">ზომა</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      {["1024x1024", "1792x1024", "1024x1792"].map((size) => (
                        <button key={size} className="px-2 py-1.5 text-xs bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:bg-white/10 transition-colors">{size}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">მოდელი</label>
                    <select className="w-full mt-1 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-gray-300 text-sm focus:outline-none">
                      <option>DALL-E 3</option>
                      <option>Midjourney v6</option>
                      <option>Stable Diffusion XL</option>
                    </select>
                  </div>
                </div>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleGenerate} disabled={!prompt.trim() || isGenerating} className="w-full mt-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                  {isGenerating ? <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />გენერირება...</> : <><Wand2 className="w-5 h-5" />შექმნა</>}
                </motion.button>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2">
              <div className="aspect-square max-h-[600px] rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm flex items-center justify-center overflow-hidden">
                {isGenerating ? (
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    <p className="text-gray-400">სურათი იქმნება...</p>
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
                    <ImageIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p>თქვენი სურათი გამოჩნდება აქ</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <motion.button whileHover={{ scale: 1.05 }} className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white"><Download className="w-5 h-5" /></motion.button>
                <motion.button whileHover={{ scale: 1.05 }} className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white"><Share2 className="w-5 h-5" /></motion.button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </main>
  );
}
